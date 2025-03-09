async function createMapData(drawJson, options = {}) {
  removeDownButton();
  if (!drawJson || drawJson.length == 0) return "";
  let svc = map.getService();
  let doc = options;
  doc ??= {};
  if (doc.from && doc.from.indexOf("/") < 0) {
    doc.from += "/v1";
  }
  let blocks = [];
  let entitys = [];
  let layers = [];
  let hasLinetypes = false;
  let layerset = new Set();
  const convertEntity = (drawEnt, isBlock) => {
    if (drawEnt.entitys && Array.isArray(drawEnt.entitys)) {
      // 如果是块
      for (let k = 0; k < drawEnt.entitys.length; k++) {
        convertEntity(drawEnt.entitys[k], true);
      }
      blocks.push(drawEnt);
    }
    if (typeof drawEnt.color == "string") {
      if (isBlock && drawEnt.color == "#000000") {
        drawEnt.colorIndex = 0; // 随层
      } else {
        drawEnt.color = vjmap.htmlColorToEntColor(drawEnt.color);
      }
    } else if (isBlock && !drawEnt.color) {
      drawEnt.colorIndex = 256; // 随层
    }
    if (typeof drawEnt.textColor == "string") {
      drawEnt.textColor = vjmap.htmlColorToEntColor(drawEnt.textColor);
    }
    if (typeof drawEnt.arrowColor == "string") {
      drawEnt.arrowColor = vjmap.htmlColorToEntColor(drawEnt.arrowColor);
    }
    if (typeof drawEnt.lineColor == "string") {
      drawEnt.lineColor = vjmap.htmlColorToEntColor(drawEnt.lineColor);
    }
    if (typeof drawEnt.rotation == "number") {
      drawEnt.rotation = (drawEnt.rotation * Math.PI) / 180;
    }
    if (drawEnt.isDashline) {
      drawEnt.linetype = "my_dash_line";
      hasLinetypes = true;
    }
    if (drawEnt.rotateMat || drawEnt.scaleMat || drawEnt.translateMat) {
      drawEnt.matrix ??= [];
      let origin =
        drawEnt.originMat ??
        drawEnt.position ??
        drawEnt.location ??
        drawEnt.center;
      if (drawEnt.scaleMat) {
        drawEnt.matrix.push({
          op: "scale",
          scale: drawEnt.scaleMat,
          origin: origin,
        });
      }
      if (drawEnt.rotateMat) {
        drawEnt.matrix.push({
          op: "rotate",
          angle: (drawEnt.rotateMat * Math.PI) / 180,
          origin: origin,
        });
      }
      if (drawEnt.translateMat) {
        drawEnt.matrix.push({
          op: "translation",
          vector: drawEnt.translateMat,
        });
      }
    }
    if (
      typeof drawEnt.cloneFromDb == "string" &&
      drawEnt.cloneFromDb.indexOf("/") < 0
    ) {
      drawEnt.cloneFromDb += "/v1";
    }
    if (drawEnt.typename == "DbHatch") {
      if (drawEnt.color && !drawEnt.patternBackgroundColor) {
        drawEnt.patternBackgroundColor = drawEnt.color;
      } else {
        drawEnt.patternBackgroundColor = vjmap.htmlColorToEntColor(
          drawEnt.patternBackgroundColor ?? "#FF0000"
        );
      }
    } else if (drawEnt.typename == "DbTable") {
      if (drawEnt.data) {
        for (let row of drawEnt.data) {
          for (let data of row) {
            if (typeof data == "object") {
              if ("backgroundColor" in data) {
                if (
                  data.backgroundColor.toLowerCase &&
                  (data.backgroundColor.toLowerCase() == "#ffffff" ||
                    data.backgroundColor.toLowerCase() == "#000000")
                ) {
                  delete data.backgroundColor;
                } else {
                  data.backgroundColor = vjmap.htmlColorToEntColor(
                    data.backgroundColor
                  );
                }
              }
              if ("contentColor" in data) {
                if (
                  data.contentColor.toLowerCase &&
                  (data.contentColor.toLowerCase() == "#ffffff" ||
                    data.contentColor.toLowerCase() == "#000000")
                ) {
                  delete data.contentColor;
                } else {
                  data.contentColor = vjmap.htmlColorToEntColor(
                    data.contentColor
                  );
                }
              }
            }
          }
        }
      }
    }
    if (drawEnt.layer) {
      if (!layerset.has(drawEnt.layer)) {
        layers.push(drawEnt.layer);
        layerset.add(drawEnt.layer);
      }
    }
  };
  drawJson ??= [];
  for (let i = 0; i < drawJson.length; i++) {
    if (drawJson[i].typename == "BaseMap") {
      doc.from = drawJson[i].from;  
      doc.pickLayers = drawJson[i].pickLayers;
      if (doc.from && doc.from.indexOf('/') < 0) {
        doc.from += "/v1"
      }
      continue;
    }
    if (!(drawJson[i].entitys && Array.isArray(drawJson[i].entitys))) {
      entitys.push(drawJson[i]);
    }
    convertEntity(drawJson[i], false);
  }
  doc.blocks = blocks;
  doc.entitys = entitys;
  doc.layers = layers.map((layer) => {
    return {
      name: layer,
      color: 7,
    };
  });
  doc.isZoomExtents ??= true;
  if (hasLinetypes) {
    let linetype = new vjmap.DbLineType();
    linetype.name = "my_dash_line";
    linetype.comments = "虚线";

    linetype.style = [
      {
        "method": "numDashes",  //组成线型的笔画数目
        "parameter": 2
      },
      {
        "method": "patternLength",// 线型总长度
        "parameter": 1.0
      },
      {
        "method": "dashLengthAt", //0.5个单位的划线
        "parameter": [0, 0.5]
      },
      {
        "method": "dashLengthAt",//0.25个单位的空格
        "parameter": [1, -0.5]
      }
    ]
    doc.linetypes = [linetype]
  }
  // doc.environment = {
  //   LWDISPLAY: true // 显示线宽
  // }
  let mapid = vjmap.getTempMapId(60 * 24); // 根据时间生成临时地图id
  map.logInfo("正在创建CAD地图，请稍候...", "success", 8000);
  // js代码
  let res = await svc.updateMap({
    mapid: mapid,
    filedoc: JSON.stringify(doc),
    mapopenway: vjmap.MapOpenWay.Memory,
    style: {
      backcolor: 0,
    },
  });
  if (res.error) {
    map.logInfo("创建地图失败！" + res.error, "error", 3000);
    return
  }
  map.removeMarkers();
  map.removePopups();
  // 把所有绘图图层删除了
  // @ts-ignore
  const controls = map._controls;
  for (let k = controls.length - 1; k >= 0; k--) {
    if (controls[k] instanceof vjmap.Draw.Tool) {
      map.removeControl(controls[k]);
    }
  }
  let sources = map.getStyle().sources;
  for (let item in sources) {
    if (item != "highlight-source" && sources[item].type == "geojson") {
      // 只是把类型为geojson的移除了。同时点击高亮的图层不要删除了
      map.removeSourceEx(item);
    }
  }
  await map.switchMap({
    mapid: mapid,
    style: vjmap.openMapDarkStyle(),
  });

  // 使地图全部可见
  map.fitMapBounds();
  addDownButton();
  return mapid;
}

async function downloadDwg() {
  let svc = map.getService();
  let fileid = svc.currentMapParam()?.fileid;
  if (!fileid) {
    map.logInfo("当前地图没有fileid，无法下载", "error");
    return;
  }

  let downUrl = "_download_cad";
  let href = `${svc.baseUrl()}${downUrl}/${fileid}.dwg?token=${
    svc.accessToken
  }`;
  window.open(href, "_blank");
}

function removeDownButton() {
  if (window._btnGroupCtrl) {
    window._btnGroupCtrl.remove();
    delete window._btnGroupCtrl;
  }
}

function addDownButton() {
  let options = {};
  options.buttons = [
    {
      id: "download",
      title: "下载当前的dwg图",
      text: "下载",
      onActivate: (ctx, e) => {
        downloadDwg();
      },
    },
  ];
  let btnGroupCtrl = new vjmap.ButtonGroupControl(options);
  map.addControl(btnGroupCtrl, "top-right");
  window._btnGroupCtrl = btnGroupCtrl;
}
