// One consistent tab controller: prevents an empty main area when multiple modules switch views.
(function(){
 const tabs=document.querySelectorAll("nav.tabs .tab[data-view]");
 const sections=document.querySelectorAll("main > section");
 function activate(tab){
  const view=tab.dataset.view;
  const target=document.getElementById(view==="dailyplans"?"dailyPlans":view);
  if(!target)return;
  for(const section of sections)section.hidden=section!==target;
  for(const item of tabs)item.classList.toggle("active",item===tab);
 }
 document.querySelector("nav.tabs")?.addEventListener("click",event=>{
  const tab=event.target.closest(".tab[data-view]");
  if(!tab)return;
  queueMicrotask(()=>activate(tab));
 });
 // Restore a usable screen after page load even if another module hid every section.
 if(![...sections].some(s=>!s.hidden)){
  const initial=document.querySelector("#dailyButton");
  if(initial)activate(initial);
 }
})();
