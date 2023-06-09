let reader;
let enhancer;
let interval;
let processing = false;
window.onload = function() {
  init();
  document.getElementsByClassName("scanButton")[0].addEventListener("click",function(){
    startScan();
  });
  loadPreviousData();
}

function loadPreviousData(){
  let secret = localStorage.getItem('notion_secret');
  let databaseID = localStorage.getItem('notion_database_id');
  if (secret) {
    document.getElementById("secretInput").value = secret;
  }
  if (databaseID) {
    document.getElementById("databaseInput").value = databaseID;
  }
}

async function init(){
  updateStatus("Initializing...");
  if (window.location.host === "notion-barcode-scanner.azurewebsites.net") {
    Dynamsoft.DBR.BarcodeReader.license = "DLS2eyJoYW5kc2hha2VDb2RlIjoiMTAwMjI3NzYzLXIxNjgxMjg1NTU0IiwibWFpblNlcnZlclVSTCI6Imh0dHBzOi8vbWx0cy5keW5hbXNvZnQuY29tLyIsIm9yZ2FuaXphdGlvbklEIjoiMTAwMjI3NzYzIiwic3RhbmRieVNlcnZlclVSTCI6Imh0dHBzOi8vc2x0cy5keW5hbXNvZnQuY29tLyIsImNoZWNrQ29kZSI6NTg2MjMxODQxfQ==";
  }else{
    Dynamsoft.DBR.BarcodeReader.license = "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ=="; //public trial
  }
  reader = await Dynamsoft.DBR.BarcodeScanner.createInstance();
  await useEAN13Template();
  enhancer = await Dynamsoft.DCE.CameraEnhancer.createInstance();
  enhancer.on("played", (playCallbackInfo) => {
    startProcessingLoop();
  });
  updateStatus("");
  await enhancer.setUIElement(Dynamsoft.DCE.CameraEnhancer.defaultUIElementURL);
  setScanRegion();
  let container = document.getElementsByClassName("scanner")[0];
  container.appendChild(enhancer.getUIElement());
  document.getElementsByClassName("dce-btn-close")[0].onclick = function () {
    stopScan();
  };
}

function startScan(){
  if (!enhancer || !reader) {
    alert("Please wait for the initialization of Dynamsoft Barcode Reader");
    return;
  }
  document.getElementsByClassName("scanner")[0].classList.add("active");
  enhancer.open(true);
}

function stopScan(){
  stopProcessingLoop();
  enhancer.close(true);
  document.getElementsByClassName("scanner")[0].classList.remove("active");
}

function updateStatus(info){
  document.getElementById("status").innerText = info;
}

function setScanRegion(){
  enhancer.setScanRegion({
    regionLeft:0,
    regionTop:25,
    regionRight:100,
    regionBottom:55,
    regionMeasuredByPercentage: 1
  });
}

async function useEAN13Template() {
  await reader.initRuntimeSettingsWithString(`
  {
    "FormatSpecification": {
      "Name": "defaultFormatParameterForAllBarcodeFormat"
    },
    "ImageParameter": {
      "BarcodeFormatIds": ["BF_EAN_13"],
      "BarcodeFormatIds_2": ["BF2_NULL"],
      "ExpectedBarcodesCount": 1,
      "FormatSpecificationNameArray": [
        "defaultFormatParameterForAllBarcodeFormat"
      ],
      "Name": "default",
      "Timeout": 3000
    },
    "Version": "3.0"
  }`);
};

function startProcessingLoop(isBarcode){
  stopProcessingLoop();
  interval = setInterval(captureAndDecode,100); // read barcodes
}

function stopProcessingLoop(){
  if (interval) {
    clearInterval(interval);
    interval = undefined;
  }
  processing = false;
}

async function captureAndDecode() {
  if (!enhancer || !reader) {
    return
  }
  if (enhancer.isOpen() === false) {
    return;
  }
  if (processing == true) {
    return;
  }
  processing = true; // set decoding to true so that the next frame will be skipped if the decoding has not completed.
  let frame = enhancer.getFrame();
  if (frame) {  
    let results = await reader.decode(frame);
    console.log(results);

      if (results.length > 0) {
        const result = results[0];
        let ISBN = result.barcodeText;
        let book;
        let title;
        let authors;
        let pageCount;
        let thumbnailLink;
        try {
          let jsonStr = await queryDetails(ISBN);
          let jsonObj = JSON.parse(jsonStr);
          let totalItems = jsonObj['totalItems'];
          console.log(jsonStr);
          if (totalItems > 0) {
            book = jsonObj.items[0];
            title = book['volumeInfo']['title'];
            authors = book['volumeInfo']['authors'].join();
            pageCount = book['volumeInfo']['pageCount'];
            thumbnailLink = book['volumeInfo']['imageLinks']['thumbnail'];
          }
        } catch (error) {
          console.log(error)
        }
        if (!title || !authors || !thumbnailLink || !pageCount) {
          try {
            jsonStr = await queryDetailsUsingDouban(ISBN);
            jsonObj = JSON.parse(jsonStr);
            if (jsonObj['title'] != null) {
              title = jsonObj['title'];
              authors = jsonObj['author'][0]['name'];
              pageCount = jsonObj['page'];
              thumbnailLink = jsonObj['logo'];
            }
          } catch (error) {
            console.log(error)
          }
        }
        if (title) {
          let rowValues = [thumbnailLink,title,authors,pageCount,ISBN];
          insertRow(rowValues);
          stopScan();
        } else {
          alert("This book is not indexed.");
        }
      }
      processing = false;  
  }
};

function insertRow(rowValues){
  let table = document.getElementsByClassName("results")[0];
  let tr = document.createElement("tr");
  for (let index = 0; index < rowValues.length; index++) {
    const value = rowValues[index];
    let td = document.createElement("td");
    if (index === 0) {
      let cover = document.createElement("img");
      cover.className = "cover";
      cover.src = "./file?url="+ encodeURIComponent(value);
      td.className = "coverCell";
      td.appendChild(cover);
    }else{
      td.innerText = value;
    }
    tr.appendChild(td)
  }
  let td = document.createElement("td");
  let sendButton = document.createElement("button");
  sendButton.innerText = "Send to Notion";
  sendButton.addEventListener("click",function(){
    sendToNotion(rowValues);
  });
  td.appendChild(sendButton);
  tr.appendChild(td);
  table.appendChild(tr);
}

function queryDetails(isbn){
  return new Promise(function (resolve, reject) {
    let url = './book?isbn=' + isbn;
    console.log(url);
    let xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onreadystatechange = function(){
      if(xhr.readyState === 4) {
        resolve(xhr.responseText);
      }
    }
    xhr.onerror = function(){
      reject("error");
    }
    xhr.send();
  });
}

function queryDetailsUsingDouban(isbn){
  return new Promise(function (resolve, reject) {
    let url = './doubanbook?isbn=' + isbn;
    let xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.onreadystatechange = function(){
      if(xhr.readyState === 4) {
        resolve(xhr.responseText);
      }
    }
    xhr.onerror = function(){
      reject("error");
    }
    xhr.send();
  });
}

function sendToNotion(rowValues){
  let endpoint = './notion';
  const secret = document.getElementById("secretInput").value;
  const databaseID = document.getElementById("databaseInput").value;
  localStorage.setItem('notion_secret', secret);
  localStorage.setItem('notion_database_id', databaseID);
  const thumbnailLink = rowValues[0];
  const title = rowValues[1];
  const authors = rowValues[2];
  const pageCount = rowValues[3];
  const ISBN = rowValues[4];
  const payload_for_notion = `{
    "parent": { "database_id": "`+databaseID+`" },
    "cover": {
      "type": "external",
      "external": {
        "url": "`+thumbnailLink+`"
      }
    },
    "properties": {
      "Name": {
        "title": [
          {
            "text": {
              "content": "`+title+`"
            }
          }
        ]
      },
      "Authors": {
        "rich_text": [
          {
            "text": {
              "content": "`+authors+`"
            }
          }
        ]
      },
      "ISBN": {
        "rich_text": [
          {
            "text": {
              "content": "`+ISBN+`"
            }
          }
        ]
      },
      "Page Count": {
        "rich_text": [
          {
            "text": {
              "content": "`+pageCount+`"
            }
          }
        ]
      }
    }
  }`
  const payload = {"secret":secret,"pay_load":payload_for_notion}
  let xhr = new XMLHttpRequest();
  xhr.open('POST', endpoint);
  xhr.setRequestHeader('content-type', 'application/json'); 
  xhr.onreadystatechange = function(){
    if(xhr.readyState === 4){
      console.log(xhr.responseText);
      updateStatus("");
      alert("Sent");
    }
  }
  xhr.onerror = function(){
    console.log("error");
    updateStatus("");
    alert("failed");
  }
  xhr.send(JSON.stringify(payload));
  updateStatus("Sending...");
}