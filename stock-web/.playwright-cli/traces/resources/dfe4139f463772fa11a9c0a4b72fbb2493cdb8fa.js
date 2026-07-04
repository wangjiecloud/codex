try{
  function http2Https(){
    var targetProtocol = "https:";
    if (window.location.protocol != targetProtocol){
      window.location.href = targetProtocol +
      window.location.href.substring(window.location.protocol.length);
    }
  }
  var userAgent = navigator.userAgent;
  if(/(iPhone|iPod|iTouch|iOS)/i.test(navigator.userAgent)||/android/i.test(navigator.userAgent)){
      var search = window.location.search;
    if(sessionStorage.getItem("has_jump_to_web")!=1 && search.indexOf("jumph5=1")<=0){
      var pathname=window.location.pathname;
      if(pathname.indexOf("list")>0){
        var matches=pathname.match(/list,(.+).html/);
        window.location.href="//mguba.eastmoney.com/mguba/list/"+matches[1]
      }else{
        if(pathname.indexOf("news")>0){
          var matches=pathname.match(/news,(.+?),([0-9a-zA-Z]+).*.html/);
          window.location.href="//mguba.eastmoney.com/mguba/article/0/"+matches[2]
        }else{
          window.location.href="//mguba.eastmoney.com/"
        }
      }
    }
  }//Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:96.0) Gecko/20100101 Firefox/96.0
  else if(/firefox/i.test(userAgent.toLocaleLowerCase())){//firefox 96以上版本 临时http强跳https
    var splitArr = userAgent.split('\/');
    var version = splitArr[splitArr.length-1];
    if(Number.parseInt(version)>=96){
      http2Https();
    }
  }  
}catch(error){
  console.log(error)
};
// window.location.pathname.match(/news,(.+?),([0-9a-zA-Z]+).*.html/);