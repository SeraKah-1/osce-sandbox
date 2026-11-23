export const WIDGET_URI='ui://osce-sandbox-studio/interactive.html';

export function renderWidget(css, graphics, ui){
 css=css.replace(/<\/style/gi,'<\\/style');
 graphics=graphics.replaceAll('export function ','function ');
 const script=(graphics+'\n'+ui).replace(/<\/script/gi,'<\\/script');
 return `<!doctype html><html lang="id"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>OSCE Sandbox Studio</title><style>${css}</style></head><body>
 <div class="app"><div class="header"><div><strong>OSCE · Sandbox Studio</strong><small id="title">Clinical 3D Editor</small></div><div class="hdr-actions"><small id="connection">MEMUAT</small><button id="refresh" title="Ambil ulang scene">↻</button></div></div>
 <div class="layout"><div class="view"><canvas id="scene3d" aria-label="3D interactive clinical scene"></canvas><div class="markers" id="hotspots"></div><div class="controls"><button id="modeSelect">Pilih/Sendi</button><button id="modeMove">Geser objek</button><button id="cameraReset">Reset kamera</button></div><div class="notice" id="notice" hidden></div></div>
 <div class="sidebar"><div class="tabs" id="tabs"><button data-tab="scene" class="active">Scene</button><button data-tab="asset">Alat</button><button data-tab="scenario">OSCE</button><button data-tab="builder">Builder</button></div>
 <section class="section" data-section="scene"><h3>Objek</h3><div id="entities"></div><div class="inline"><button id="addDoctor">+ Dokter</button><button id="addPatient">+ Pasien</button></div></section>
 <section class="section" data-section="asset" hidden><h3>Katalog alat</h3><select id="assetSelect" aria-label="Pilih instrumen"></select><button class="primary" id="addAsset">+ Tambahkan ke scene</button><p>Aset AI yang sudah dibuat akan muncul di katalog ini.</p></section>
 <section class="section" data-section="scenario" hidden><h3 id="scenarioTitle"></h3><p id="scenarioNote"></p><div id="steps"></div></section>
 <section class="section" data-section="builder" hidden><h3>Behavior JSON</h3><textarea id="behaviorJSON" spellcheck="false"></textarea><button class="primary" id="createBehavior">Buat behavior</button><h3 style="margin-top:16px">Aset geometri JSON</h3><textarea id="assetJSON" spellcheck="false"></textarea><button class="primary" id="createAsset">Buat aset</button><p>Buat behavior lebih dahulu, lalu tambahkan behaviorId pada aset untuk memasang logika.</p></section>
 <div id="inspector" class="inspector"><p>Pilih karakter atau alat.</p></div><div id="connectionPanel" class="section" hidden><label for="previewToken">Token API untuk preview lokal</label><input id="previewToken" type="password" autocomplete="off"/><button id="saveToken">Hubungkan</button></div>
 </div></div><div class="foot"><span>Drag orbit · pinch zoom · sentuh sendi</span><span id="revision">REV 0</span></div></div><script type="module">${script}</script></body></html>`;
}
