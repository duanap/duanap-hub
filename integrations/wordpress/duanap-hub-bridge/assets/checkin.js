// Enrich the existing Zibll button before its delegated click handler runs.
document.addEventListener('click',function(event){
  const button=event.target instanceof Element?event.target.closest('.initiate-checkin[form-action="user_checkin"]'):null;
  const config=document.getElementById('duanap-hub-checkin-config');
  if(!button||!config)return;
  try{
    const data=JSON.parse(button.getAttribute('form-data')||'{}');
    data._wpnonce=JSON.parse(config.textContent).nonce;
    button.setAttribute('form-data',JSON.stringify(data));
  }catch{event.preventDefault();event.stopPropagation();}
},true);
