/* Route legacy same-origin API requests to the Render backend on GitHub Pages. */
(()=>{
  if(location.hostname!=="filorensuarez.github.io")return;
  const backend=(localStorage.getItem("traderadar-api-base")||"https://traderadar-yro7.onrender.com").replace(/\\/$/,"");
  const original=window.fetch.bind(window);
  window.fetch=(input,init)=>{
    if(typeof input==="string"&&input.startsWith("/api/"))input=backend+input;
    else if(input instanceof Request&&new URL(input.url).origin===location.origin&&new URL(input.url).pathname.startsWith("/api/"))input=new Request(backend+new URL(input.url).pathname+new URL(input.url).search,input);
    return original(input,init);
  };
})();
