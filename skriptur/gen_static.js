// Generates a static (no-JS) Hagvísir page using only kses-safe inline styles,
// then publishes it to karp.is via the royal-mcp REST API.
const fs = require('fs');

const KEY = process.env.KARP_KEY || '';  // settu $env:KARP_KEY áður en þú keyrir
const ENDPOINT = 'https://karp.is/wp-json/royal-mcp/v1/pages';

// ---- real data (latest pull, baked) ----
const KPIS = [
  {label:'Verðbólga', val:'5,1%', sub:'ársbreyting VNV · maí 2026', accent:'#f6b13b'},
  {label:'Stýrivextir', val:'7,75%', sub:'meginvextir · frá 20.05.2026', accent:'#4d8df6'},
  {label:'Hagvöxtur', val:'+2,7%', sub:'VLF magn · 1. ársfj. 2026', accent:'#46e08a'},
  {label:'Atvinnuleysi', val:'5,6%', sub:'árstíðaleiðrétt · apríl 2026', accent:'#9a7cf7'},
  {label:'Gengi €/kr', val:'144,4', sub:'evra í krónum', accent:'#19d3c5'},
  {label:'Íbúðaverð', val:'+3,4%', sub:'ársbreyting · landið allt', accent:'#ff5d6c'},
];
const INF = [['maí ’25',3.8],['jún',4.2],['júl',4.0],['ágú',3.8],['sep',4.1],['okt',4.3],['nóv',3.7],['des',4.5],['jan ’26',5.2],['feb',5.2],['mar',5.4],['apr',5.2],['maí',5.1]];
const GDP = [[2016,6.2],[2017,3.5],[2018,4.7],[2019,1.1],[2020,-6.6],[2021,5.2],[2022,8.9],[2023,5.0],[2024,-1.3],[2025,1.3]];

const card='background:linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02));border:1px solid #1b2740;border-radius:18px;padding:18px 18px 16px;';

function kpiCard(k){
  return '<div style="flex:1 1 168px;min-width:168px;'+card+'border-top:3px solid '+k.accent+';">'
    +'<div style="font-size:13px;color:#94a3bd;margin-bottom:8px;">'+k.label+'</div>'
    +'<div style="font-size:34px;font-weight:700;letter-spacing:-1px;color:#eaf1fb;line-height:1;">'+k.val+'</div>'
    +'<div style="font-size:12px;color:#5d6b85;margin-top:6px;">'+k.sub+'</div></div>';
}

function infChart(){
  const max=6;
  let bars='';
  INF.forEach(function(d){
    const h=Math.round(d[1]/max*150);
    bars+='<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;">'
      +'<div style="font-size:10.5px;color:#cdd8e8;margin-bottom:4px;">'+String(d[1]).replace('.',',')+'</div>'
      +'<div style="width:62%;height:'+h+'px;background:linear-gradient(180deg,#f6b13b,rgba(246,177,59,0.15));border-radius:4px 4px 0 0;"></div>'
      +'<div style="font-size:10px;color:#7e8ca6;margin-top:6px;white-space:nowrap;">'+d[0]+'</div></div>';
  });
  return '<div style="'+card+'margin-top:16px;">'
    +'<div style="font-size:16.5px;font-weight:600;color:#eaf1fb;">Verðbólga síðustu 13 mánuði</div>'
    +'<div style="font-size:12.5px;color:#94a3bd;margin:2px 0 14px;">Ársbreyting vísitölu neysluverðs (%). Verðbólgumarkmið Seðlabankans er 2,5%.</div>'
    +'<div style="display:flex;align-items:flex-end;gap:5px;height:185px;">'+bars+'</div></div>';
}

function gdpChart(){
  const maxAbs=9;
  let rows='';
  GDP.forEach(function(d){
    const pos=d[1]>=0;
    const w=Math.round(Math.abs(d[1])/maxAbs*50);
    rows+='<div style="display:flex;align-items:center;gap:10px;margin:7px 0;font-size:12.5px;color:#cdd8e8;">'
      +'<div style="width:42px;color:#7e8ca6;flex:none;">'+d[0]+'</div>'
      +'<div style="flex:1;display:flex;align-items:center;">'
        +'<div style="width:50%;display:flex;justify-content:flex-end;"><div style="height:14px;width:'+(pos?0:w)+'%;background:#ff5d6c;border-radius:3px 0 0 3px;"></div></div>'
        +'<div style="width:1px;height:20px;background:rgba(255,255,255,0.25);"></div>'
        +'<div style="width:50%;"><div style="height:14px;width:'+(pos?w:0)+'%;background:#46e08a;border-radius:0 3px 3px 0;"></div></div>'
      +'</div>'
      +'<div style="width:46px;text-align:right;flex:none;color:'+(pos?'#46e08a':'#ff5d6c')+';font-weight:500;">'+(pos?'+':'')+String(d[1]).replace('.',',')+'%</div>'
    +'</div>';
  });
  return '<div style="'+card+'margin-top:16px;">'
    +'<div style="font-size:16.5px;font-weight:600;color:#eaf1fb;">Hagvöxtur 2016–2025</div>'
    +'<div style="font-size:12.5px;color:#94a3bd;margin:2px 0 14px;">Raunbreyting vergrar landsframleiðslu milli ára (%).</div>'
    +rows+'</div>';
}

const html =
'<div style="background:#070b16;color:#eaf1fb;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;padding:40px 24px;width:100vw;max-width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);box-sizing:border-box;">'
+'<div style="max-width:1360px;margin:0 auto;">'
+'<div style="display:inline-block;font-size:12.5px;color:#46e08a;border:1px solid #2f7d57;border-radius:999px;padding:5px 13px;margin-bottom:18px;">● Lifandi hagtölur</div>'
+'<div style="font-size:46px;font-weight:700;letter-spacing:-1.4px;line-height:1.05;color:#eaf1fb;">Púls íslenska hagkerfisins</div>'
+'<div style="font-size:17px;color:#94a3bd;margin:14px 0 26px;max-width:620px;font-weight:300;">Helstu hagstærðir Íslands — byggt á gögnum frá Hagstofu Íslands, Seðlabankanum og Seðlabanka Evrópu.</div>'
+'<div style="display:flex;flex-wrap:wrap;gap:14px;">'+KPIS.map(kpiCard).join('')+'</div>'
+infChart()
+gdpChart()
+'<div style="margin-top:18px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.09);color:#5d6b85;font-size:12.5px;line-height:1.7;">'
+'<span style="color:#94a3bd;">Heimildir:</span> Hagstofa Íslands · Seðlabanki Íslands · Seðlabanki Evrópu (ECB). '
+'Þetta er forsýn með nýjustu tölum; gagnvirka útgáfan með lifandi, uppfærðum gröfum er á leiðinni.</div>'
+'</div></div>';

const body = JSON.stringify({title:'Hagvísir Íslands', slug:'hagvisir', status:'publish', content:html});

(async function(){
  fs.writeFileSync('C:/Users/aronh/OneDrive/Documents/KARP/hagvisir/static_content.html', html);
  const r = await fetch(ENDPOINT+'/2862',{method:'PUT',headers:{'X-Royal-MCP-API-Key':KEY,'Content-Type':'application/json'},body});
  const t = await r.text();
  console.log('HTTP', r.status);
  console.log(t.slice(0,700));
})();
