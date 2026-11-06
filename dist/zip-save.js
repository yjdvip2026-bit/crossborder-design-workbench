'use strict';
let zipDirectory=null,zipDirectoryRemembered=false,zipDirectoryReady=null,zipSaving=false,zipLocationError='',zipSavePending=false,zipLocationLoading=false;
const canPickZipFolder=()=>window.isSecureContext&&typeof window.showDirectoryPicker==='function';
function featureNotice(cn,en){toast(cn);$('#toast').textContent=cn+' / '+en}
function zipHandleStore(action,handle){return new Promise((resolve,reject)=>{
 if(!window.indexedDB)return reject(Error('IndexedDB unavailable'));
 let request=indexedDB.open('design-atlas-local-files',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('preferences');
 request.onerror=()=>reject(request.error);
 request.onblocked=()=>reject(Error('Storage blocked'));
 request.onsuccess=()=>{let db=request.result,tx;
  try{tx=db.transaction('preferences',action==='load'?'readonly':'readwrite')}catch(e){db.close();return reject(e)}
  let op=action==='load'?tx.objectStore('preferences').get('zip-directory'):tx.objectStore('preferences').put(handle,'zip-directory'),result;
  op.onsuccess=()=>{result=op.result};tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('Storage failed'))};
 };
})}
function restoreZipDirectory(){if(!zipDirectoryReady){zipLocationLoading=true;zipDirectoryReady=(async()=>{try{let saved=await zipHandleStore('load');if(saved?.kind==='directory'){zipDirectory=saved;zipDirectoryRemembered=true}}catch{}zipLocationLoading=false;updateZipSaveUI();renderCompression()})();}return zipDirectoryReady}
function zipSaveMarkup(){return `<section class="zip-save-panel"><div class="zip-save-heading"><div><b>ZIP 保存位置</b><small>SAVE LOCATION</small></div><button class="secondary" id="chooseZipFolder" type="button">选择保存文件夹</button></div><div id="zipSaveStatus" class="subtle" role="status" aria-live="polite">正在读取保存位置 / Loading save location…</div><p class="subtle zip-location-help">首次选择后记住该文件夹；以后默认保存到这里，直到重新选择。浏览器可能要求重新授权。<br>Remembered on this browser. Access may need to be granted again.</p><div id="zipLocationError" class="error" role="alert"></div><button class="secondary" id="zipBrowserDownload" type="button" hidden>改用浏览器默认下载</button><a class="text-button" id="zipOpenBrowser" target="_blank" rel="noopener noreferrer">在独立浏览器中打开 ↗</a></section>`}
function updateZipSaveUI(){if(!$('#zipSaveStatus'))return;let supported=canPickZipFolder();$('#chooseZipFolder').disabled=!supported||zipSaving||zipSavePending||zipLocationLoading;$('#chooseZipFolder').textContent=zipDirectory?'重新选择文件夹':'选择保存文件夹';$('#zipSaveStatus').textContent=zipLocationLoading?'正在读取保存位置 / Loading save location…':!supported?'浏览器默认下载位置 / Browser download location':zipDirectory?`当前文件夹 / Folder: ${zipDirectory.name}${zipDirectoryRemembered?' · 已记住 / Remembered':' · 仅本次会话 / This session only'}`:'尚未选择文件夹；首次打包时选择 / Choose a folder before your first save.';$('.zip-location-help').innerHTML=supported?'首次选择后记住该文件夹；以后默认保存到这里，直到重新选择。浏览器可能要求重新授权。<br>Remembered on this browser. Access may need to be granted again.':'当前浏览器不支持网页指定文件夹，将使用浏览器的下载设置。可在桌面版 Chrome / Edge 的独立窗口尝试。<br>This browser controls the download location. Try a standalone desktop Chrome / Edge window.';$('#zipLocationError').textContent=zipLocationError;$('#zipOpenBrowser').href=location.href;$('#zipOpenBrowser').hidden=!zipLocationError&&supported;$('#zipBrowserDownload').hidden=!supported||!zipLocationError;$('#zipBrowserDownload').disabled=zipSaving||zipSavePending||compressionBusy||!compressionFiles.some(f=>f.result)}
async function chooseZipFolder(){if(!canPickZipFolder()||zipSaving)return null;try{
 let picked=await window.showDirectoryPicker({id:'design-atlas-zip-output',mode:'readwrite',startIn:zipDirectory||'downloads'});
 zipDirectory=picked;zipDirectoryRemembered=false;zipLocationError='';
 try{await zipHandleStore('save',picked);zipDirectoryRemembered=true}catch{}
 updateZipSaveUI();return picked;
}catch(e){if(e.name!=='AbortError'){zipLocationError='无法选择文件夹。请在独立浏览器打开，或检查文件夹权限。 / Folder selection failed. Open in a standalone browser or check access.';updateZipSaveUI()}return null}}
function initZipSaveUI(){restoreZipDirectory();updateZipSaveUI();$('#chooseZipFolder').onclick=chooseZipFolder;$('#zipBrowserDownload').onclick=()=>saveCompressionZip(true)}
async function writableZipDirectory(){let directory=zipDirectory;
 if(!directory){directory=await chooseZipFolder();if(!directory)return null}
 let permission=await directory.queryPermission({mode:'readwrite'});
 if(permission!=='granted')permission=await directory.requestPermission({mode:'readwrite'});
 if(permission!=='granted'){zipLocationError='没有写入权限。请重新选择文件夹并允许保存。 / Write permission denied. Choose a folder again and allow access.';updateZipSaveUI();return null}
 return directory;
}
async function uniqueZipFile(directory,name){let base=name.replace(/\.zip$/i,'');for(let n=0;n<10000;n++){let candidate=n?`${base} (${n+1}).zip`:name;try{await directory.getFileHandle(candidate)}catch(e){if(e.name==='NotFoundError')return directory.getFileHandle(candidate,{create:true});throw e}}throw Error('Too many same-name archives')}
async function saveCompressionZip(forceBrowser=false){if(zipSaving||zipSavePending||zipLocationLoading||compressionBusy)return;let files=compressionFiles.filter(f=>f.result).map(f=>({name:f.outputName,blob:f.result}));if(!files.length)return;zipSavePending=true;renderCompression();updateZipSaveUI();
 let directory=null;if(canPickZipFolder()&&forceBrowser!==true){try{directory=await writableZipDirectory()}catch(e){zipLocationError='保存位置暂不可用，请重新选择。 / Save location unavailable. Choose a folder again.';zipSavePending=false;renderCompression();updateZipSaveUI();return}if(!directory){zipSavePending=false;renderCompression();updateZipSaveUI();return}}
 // ZIP creation starts only after folder permission has been granted by this click.
 zipSaving=true;zipSavePending=false;zipLocationError='';renderCompression();updateZipSaveUI();let button=$('#downloadZip');if(button)button.innerHTML=icon('clock')+'正在打包 / Saving…';
 try{let blob=await zipFiles(files),name=`design-atlas-images-${day()}.zip`;
  if(directory){let file=await uniqueZipFile(directory,name),writer=await file.createWritable();try{await writer.write(blob);await writer.close()}catch(e){try{await writer.abort()}catch{}throw e}featureNotice('ZIP 已保存到「'+directory.name+'」','ZIP saved to the selected folder.')}else{download(blob,name);featureNotice('ZIP 已交给浏览器下载','ZIP download started. The browser controls its save location.')}
 }catch(e){zipLocationError='保存失败，请检查文件夹权限和可用空间后重试。 / Save failed. Check folder access and free space, then retry.';featureNotice('ZIP 保存失败，请重试','ZIP save failed. Check access and free space.')}
 finally{zipSaving=false;renderCompression();updateZipSaveUI();if($('#downloadZip'))$('#downloadZip').innerHTML=icon('download')+'打包下载 ZIP'}
}
