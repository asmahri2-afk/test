// js/dossier.js — Dossier feature (lazy-loaded on first click)
// Guard: skip if already loaded
if (!window.openDossier) {

// ─────────────────────────────────────────────────────────────────────────────
// PORT CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const PORT_DOCS = {
    laayoune: {
        label: 'Laâyoune', pilotage: false,
        templates: ['tva-anp','tva-marsa','gardiennage','timesheet',
            'manifest-import-entree','manifest-import-sortie',
            'manifest-export-entree','manifest-export-sortie',
            'declaration-import','declaration-export','overtime','stowaway'],
    },
    dakhla: {
        label: 'Dakhla', pilotage: true,
        templates: ['tva-anp','tva-marsa','pilotage','gardiennage','timesheet',
            'manifest-import-entree','manifest-import-sortie',
            'manifest-export-entree','manifest-export-sortie',
            'declaration-import','declaration-export','overtime','stowaway'],
    },
    'dakhla-anch': {
        label: 'Dakhla Anch.', pilotage: true,
        templates: ['tva-anp','tva-marsa','pilotage','gardiennage','timesheet',
            'manifest-import-entree','manifest-import-sortie',
            'manifest-export-entree','manifest-export-sortie',
            'declaration-import','declaration-export','overtime','stowaway'],
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE DEFINITIONS  (tags = exact {{placeholders}} in each .docx)
// ─────────────────────────────────────────────────────────────────────────────
const TPL = {
    'tva-anp':                { label:'TVA — ANP',               g:'tva',      ops:['import','export'],
        tags:['vessel_name','imo','flag','arrival_date','bc'] },
    'tva-marsa':              { label:'TVA — Marsa Maroc',        g:'tva',      ops:['import','export'],
        tags:['vessel_name','imo','flag','arrival_date','bc'] },
    'pilotage':               { label:'Pilotage',                 g:'ops',      ops:['import','export','cabotage'],
        tags:['vessel_name','bc','berthing_date','date'] },
    'gardiennage':            { label:'Gardiennage',              g:'ops',      ops:['import','export','cabotage'],
        tags:['vessel_name','port','date','berthing_date','agent_count','ste_garde'] },
    'timesheet':              { label:'Timesheet',                g:'ops',      ops:['import','export','cabotage'],
        tags:['vessel_name','flag','loa','deadweight','gross_tonnage','owner','cargo'] },
    'manifest-import-entree': { label:'Manifest Import — Entrée', g:'manifest', ops:['import'],
        tags:['vessel_name','flag','berthing_date','departure_date','from','to','cargo','bl_weight','shipper','notify'] },
    'manifest-import-sortie': { label:'Manifest Import — Sortie', g:'manifest', ops:['import'],
        tags:['vessel_name','flag','berthing_date','departure_date','from','to'] },
    'manifest-export-entree': { label:'Manifest Export — Entrée', g:'manifest', ops:['export'],
        tags:['vessel_name','flag','berthing_date','departure_date','from','to'] },
    'manifest-export-sortie': { label:'Manifest Export — Sortie', g:'manifest', ops:['export'],
        tags:['vessel_name','flag','berthing_date','departure_date','from','to','cargo','bl_weight','shipper','notify'] },
    'declaration-import':     { label:'Déclaration Import',       g:'decl',     ops:['import'],
        tags:['vessel_name','port','arrival_date','departure_date','today_date','from','to','cargo','bl_weight','shipper'] },
    'declaration-export':     { label:'Déclaration Export',       g:'decl',     ops:['export'],
        tags:['vessel_name','port','arrival_date','departure_date','today_date','from','to','cargo','bl_weight','shipper'] },
    'overtime':               { label:'Overtime',                 g:'misc',     ops:['import','export','cabotage'],
        tags:['vessel_name','port','arrival_date','date','today_date','expimp','shift'] },
    'stowaway':               { label:'Stowaway Report',          g:'misc',     ops:['import','export','cabotage'],
        tags:['vessel_name','port'] },
};

const GRP_LABELS  = { tva:'💰 TVA', ops:'⚙️ Opérations', manifest:'📦 Manifests', decl:'📋 Déclarations', misc:'📝 Divers' };
const GRP_ORDER   = ['tva','ops','manifest','decl','misc'];
const SHIFTS      = ['1er shift','2ème shift','3ème shift'];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const _q  = id => document.getElementById(id);
const _v  = id => { const e=_q(id); return e?e.value.trim():''; };
const _dk = imo => `dossier_draft_${imo}`;
const _td = ()  => new Date().toISOString().slice(0,10);

function _loa(imo)  { const sc=window.S?.staticCache?.get(imo)||{}; return parseFloat(sc.length_overall_m||sc.loa||0)||0; }
function _agents(imo){ const l=parseFloat(_v('dos-loa'))||_loa(imo); return l>0&&l<100?2:3; }

function _port(imo) {
    const v=window.S?.vesselsDataMap?.get(imo)||{};
    const r=(v.destination_port||v.nearest_port||v.destination||'').toLowerCase();
    if (r.includes('dakhla')) return r.includes('anch')?'dakhla-anch':'dakhla';
    if (r.includes('laayoune')||r.includes('laâyoune')||r.includes('aaiun')) return 'laayoune';
    return '';
}

function _pcdates(imo) {
    const c=window.S?.portCallsCache?.get(imo);
    if (c?.length) return { arr:(c[0].arrived||'').slice(0,10), dep:(c[0].departed||'').slice(0,10) };
    return { arr:'', dep:'' };
}

function _mload()    { try{return JSON.parse(localStorage.getItem('dossier_mem')||'{}')}catch(_){return{}} }
function _msave(obj) { localStorage.setItem('dossier_mem',JSON.stringify({..._mload(),...obj})); }

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────
function _css() {
    if (_q('dossier-css')) return;
    const s=document.createElement('style'); s.id='dossier-css';
    s.textContent=`
#dossierModal *{box-sizing:border-box;}
.ds{font-size:.68rem;font-weight:700;color:var(--text-soft);text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:10px;margin-top:16px;}
.dr{display:flex;flex-direction:column;gap:4px;margin-bottom:10px;}
.dl{font-size:.72rem;color:var(--text-soft);font-weight:600;}
.di{background:var(--bg-elevated);border:1px solid var(--border);border-radius:7px;padding:7px 10px;color:var(--text-main);font-size:.82rem;width:100%;font-family:var(--sans);outline:none;}
.di:focus{border-color:var(--accent);}
.dg2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
.dob{flex:1;padding:8px;font-size:.8rem;border:none;cursor:pointer;transition:all .2s;font-family:var(--sans);}
.dc{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;cursor:pointer;transition:background .15s;}
.dc:hover:not(.ddis){background:var(--bg-elevated);}
.ddis{opacity:.35;pointer-events:none;}
.dc input[type=checkbox]{width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;}
.dcl{font-size:.82rem;color:var(--text-main);flex:1;cursor:pointer;}
.dgl{font-size:.66rem;font-weight:700;color:var(--text-soft);margin-bottom:5px;text-transform:uppercase;letter-spacing:.06em;}
.dgr{margin-bottom:14px;}
.dno{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;padding:8px 12px;font-size:.72rem;color:var(--warning);margin-bottom:10px;display:none;}
.dsb{background:var(--bg-elevated);border-radius:10px;padding:12px;border:1px solid var(--border);margin-top:6px;display:none;}
.dsh{font-size:.67rem;color:var(--text-soft);margin-top:6px;}
.dshr{display:flex;align-items:center;gap:8px;font-size:.82rem;color:var(--text-main);margin-bottom:6px;}
.dshr input[type=checkbox]{width:15px;height:15px;accent-color:var(--accent);}`;
    document.head.appendChild(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// OPEN
// ─────────────────────────────────────────────────────────────────────────────
window.openDossier = function(imo) {
    if (window._dosOpen) return; window._dosOpen=true;
    _q('dossierModal')?.remove(); _q('dossierOverlay')?.remove();

    const v  =window.S?.vesselsDataMap?.get(imo)||{};
    const sc =window.S?.staticCache?.get(imo)||{};
    const nm =v.name||sc.name||`IMO ${imo}`;
    const dp =_port(imo);
    const dt =_pcdates(imo);
    const mem=_mload();
    const ow =window._ownersCache?.get(imo)?.name||'';

    _css();

    const ov=document.createElement('div');
    ov.id='dossierOverlay';
    ov.style.cssText='position:fixed;inset:0;z-index:9100;background:rgba(0,0,0,.55);';
    ov.onclick=e=>{if(e.target===ov)window.closeDossier();};

    const mo=document.createElement('div');
    mo.id='dossierModal';
    mo.style.cssText='position:fixed;top:0;right:0;height:100%;width:min(580px,100vw);'+
        'background:var(--bg-card);border-left:1px solid var(--border);'+
        'z-index:9101;overflow-y:auto;display:flex;flex-direction:column;'+
        'box-shadow:-8px 0 40px rgba(0,0,0,.4);';

    mo.innerHTML=`
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--bg-card);z-index:10;">
        <div><div style="font-weight:700;font-size:.95rem;color:var(--text-main);">📄 Dossier</div>
        <div style="font-size:.72rem;color:var(--text-soft);">${window.escapeHtml(nm)} — IMO ${imo}</div></div>
        <button onclick="window.closeDossier()" style="background:none;border:none;color:var(--text-soft);font-size:1.2rem;cursor:pointer;padding:4px 8px;">✕</button>
    </div>
    <div style="padding:16px 20px;flex:1;">

        <div class="ds" style="margin-top:0;">Port &amp; Opération</div>
        <div class="dr"><label class="dl">Port</label>
            <select id="dos-port" class="di" onchange="window._dosPortChange('${imo}')">
                <option value="">— Sélectionner —</option>
                ${Object.entries(PORT_DOCS).map(([k,p])=>
                    `<option value="${k}"${k===dp?' selected':''}>${p.label}</option>`
                ).join('')}
            </select></div>
        <div class="dr"><label class="dl">Opération</label>
            <div style="display:flex;gap:0;border-radius:8px;overflow:hidden;border:1px solid var(--border);">
                <button id="dos-op-import"   class="dob" onclick="window._dosSetOp('${imo}','import')"   style="background:var(--accent);color:#fff;">Import</button>
                <button id="dos-op-export"   class="dob" onclick="window._dosSetOp('${imo}','export')"   style="background:var(--bg-elevated);color:var(--text-soft);">Export</button>
                <button id="dos-op-cabotage" class="dob" onclick="window._dosSetOp('${imo}','cabotage')" style="background:var(--bg-elevated);color:var(--text-soft);">Cabotage</button>
            </div></div>

        <div class="ds">Navire</div>
        <div class="dg2">
            <div class="dr" style="margin-bottom:0;"><label class="dl">Nom du navire</label><input id="dos-vessel" class="di" type="text" value="${window.escapeHtml(nm)}"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">IMO</label><input id="dos-imo" class="di" type="text" value="${imo}" readonly style="opacity:.6;"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">Pavillon</label><input id="dos-flag" class="di" type="text" value="${window.escapeHtml(v.flag||sc.flag||'')}"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">LOA (m)</label><input id="dos-loa" class="di" type="number" step="0.1" value="${sc.length_overall_m||sc.loa||''}" onchange="window._dosUpdAgents('${imo}')"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">DWT (t)</label><input id="dos-dw" class="di" type="text" value="${window.escapeHtml(String(sc.deadweight_t||''))}"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">Jauge brute (GT)</label><input id="dos-gt" class="di" type="text" value="${window.escapeHtml(String(sc.gross_tonnage||''))}"></div>
            <div class="dr" style="margin-bottom:0;grid-column:1/-1;"><label class="dl">Propriétaire / Armateur</label><input id="dos-owner" class="di" type="text" value="${window.escapeHtml(ow)}" placeholder="Nom armateur"></div>
        </div>

        <div class="ds">Cargaison &amp; Commercial</div>
        <div class="dg2">
            <div class="dr" style="margin-bottom:0;"><label class="dl">Cargaison</label><input id="dos-cargo" class="di" type="text" placeholder="Description"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">Poids B/L</label><input id="dos-bl" class="di" type="text" placeholder="ex. 3 038,633 MT"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">Chargeur (Shipper)</label><input id="dos-shipper" class="di" type="text" value="${window.escapeHtml(mem.shipper||'')}"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">Notify Party</label><input id="dos-notify" class="di" type="text" value="${window.escapeHtml(mem.notify||'')}"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">De (From)</label><input id="dos-from" class="di" type="text" value="${window.escapeHtml(mem.from||'')}" placeholder="Port d'origine"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">À (To)</label><input id="dos-to" class="di" type="text" value="${window.escapeHtml(mem.to||'')}" placeholder="Port destination"></div>
            <div class="dr" style="margin-bottom:0;grid-column:1/-1;"><label class="dl">N° Bon de Commande (BC)</label><input id="dos-bc" class="di" type="text" value="${window.escapeHtml(mem.bc||'')}" placeholder="Numéro BC"></div>
        </div>

        <div class="ds">Dates</div>
        <div class="dg2">
            <div class="dr" style="margin-bottom:0;"><label class="dl">Date d'arrivée</label><input id="dos-arrival" class="di" type="date" value="${dt.arr}"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">Date d'accostage</label><input id="dos-berthing" class="di" type="date" value="${dt.arr}"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">Date de départ</label><input id="dos-departure" class="di" type="date" value="${dt.dep}"></div>
            <div class="dr" style="margin-bottom:0;"><label class="dl">Date du jour</label><input id="dos-date" class="di" type="date" value="${_td()}"></div>
        </div>

        <div class="ds">Documents</div>
        <div id="dos-cab-notice" class="dno">⚠️ Cabotage — documents TVA désactivés</div>
        <div id="dos-tpl-list"><div style="color:var(--text-soft);font-size:.8rem;">Sélectionnez un port.</div></div>

        <div id="dos-gard-box" class="dsb">
            <div class="ds" style="margin-top:0;">Gardiennage</div>
            <div class="dg2">
                <div class="dr" style="margin-bottom:0;"><label class="dl">Nombre d'agents</label><input id="dos-agents" class="di" type="number" min="1" max="20" value="${_agents(imo)}"></div>
                <div class="dr" style="margin-bottom:0;"><label class="dl">Société de Garde</label><input id="dos-ste-garde" class="di" type="text" value="${window.escapeHtml(mem.ste_garde||'')}" placeholder="ex. SÉCUMAR"></div>
            </div>
            <div class="dsh">Auto-calculé : LOA &lt; 100m → 2 agents, sinon 3. Modifiable.</div>
        </div>

        <div id="dos-ot-box" class="dsb">
            <div class="ds" style="margin-top:0;">Overtime — Shifts</div>
            ${SHIFTS.map((s,i)=>`<label class="dshr"><input type="checkbox" id="dos-shift-${i}" value="${s}"> ${s}</label>`).join('')}
        </div>

        <div class="ds">Notes</div>
        <textarea id="dos-notes" class="di" rows="3" placeholder="Notes internes..." style="resize:vertical;"></textarea>
        <div id="dos-draft-info" style="font-size:.68rem;color:var(--text-soft);margin-top:4px;"></div>
    </div>

    <div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;align-items:center;position:sticky;bottom:0;background:var(--bg-card);">
        <span id="dos-msg" style="font-size:.72rem;color:var(--success);flex:1;"></span>
        <button onclick="window._dosSend('${imo}')"   class="btn-ghost"   style="padding:8px 14px;font-size:.78rem;">📤</button>
        <button onclick="window._dosClear('${imo}')"  class="btn-ghost"   style="padding:8px 14px;font-size:.78rem;color:var(--danger);border-color:rgba(239,68,68,.3);">🗑</button>
        <button onclick="window._dosSaveDraft('${imo}')" class="btn-ghost" style="padding:8px 14px;font-size:.78rem;">💾 Save</button>
        <button onclick="window._dosGenerate('${imo}')" class="btn-primary" id="dos-gen-btn" style="padding:8px 14px;font-size:.78rem;">📥 Download</button>
    </div>`;

    document.body.appendChild(ov);
    document.body.appendChild(mo);
    window._dosOpen=false;
    window._dosCurrentOp='import';

    if (dp) _renderTpl(imo,dp,'import');

    // Load draft
    window._dosLoadDraft(imo).then(d=>{
        if(!d)return;
        _applyDraft(imo,d);
        const el=_q('dos-draft-info');
        if(el) el.textContent=d._source==='supabase'&&d._updated
            ?`☁️ Sauvegardé le ${new Date(d._updated).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}`
            :'💾 Brouillon local';
    });

    // Pre-fill cargo+bl from SOF draft
    if(window.sofLoadDraft){
        window.sofLoadDraft(imo).then(sof=>{
            if(!sof)return;
            const ce=_q('dos-cargo'),be=_q('dos-bl');
            if(ce&&sof.cargo    &&!ce.value)ce.value=sof.cargo;
            if(be&&sof.bl_weight&&!be.value)be.value=sof.bl_weight;
        });
    }
};

window.closeDossier=function(){_q('dossierModal')?.remove();_q('dossierOverlay')?.remove();};

// ─────────────────────────────────────────────────────────────────────────────
// PORT / OP CHANGE
// ─────────────────────────────────────────────────────────────────────────────
window._dosPortChange=function(imo){
    const p=_v('dos-port'),op=window._dosCurrentOp||'import';
    if(p)_renderTpl(imo,p,op);
    else _q('dos-tpl-list').innerHTML='<div style="color:var(--text-soft);font-size:.8rem;">Sélectionnez un port.</div>';
};

window._dosSetOp=function(imo,op){
    window._dosCurrentOp=op;
    ['import','export','cabotage'].forEach(o=>{
        const b=_q(`dos-op-${o}`);if(!b)return;
        b.style.background=o===op?'var(--accent)':'var(--bg-elevated)';
        b.style.color     =o===op?'#fff'         :'var(--text-soft)';
    });
    const n=_q('dos-cab-notice');if(n)n.style.display=op==='cabotage'?'block':'none';
    const p=_v('dos-port');if(p)_renderTpl(imo,p,op);
};

window._dosUpdAgents=function(imo){const e=_q('dos-agents');if(e)e.value=_agents(imo);};

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE LIST RENDER
// ─────────────────────────────────────────────────────────────────────────────
function _renderTpl(imo,portKey,op){
    const cfg=PORT_DOCS[portKey],con=_q('dos-tpl-list');
    if(!cfg||!con)return;
    const cab=op==='cabotage',eop=cab?'import':op;
    const grps={};
    cfg.templates.forEach(id=>{
        const t=TPL[id];if(!t)return;
        if(['manifest','decl'].includes(t.g)&&!t.ops.includes(eop))return;
        if(!grps[t.g])grps[t.g]=[];
        grps[t.g].push(id);
    });
    let html='';
    GRP_ORDER.forEach(g=>{
        const items=grps[g];if(!items?.length)return;
        html+=`<div class="dgr"><div class="dgl">${GRP_LABELS[g]}</div>`;
        items.forEach(id=>{
            const t=TPL[id],dis=cab&&t.g==='tva',chk=!dis;
            html+=`<div class="dc ${dis?'ddis':''}" id="dos-row-${id}"
                onclick="window._dosTglRow('${imo}','${id}')">
                <input type="checkbox" id="dos-chk-${id}" ${chk?'checked':''} ${dis?'disabled':''}
                    onclick="event.stopPropagation();window._dosChk('${imo}','${id}',this.checked)">
                <label class="dcl" for="dos-chk-${id}">${t.label}</label>
            </div>`;
        });
        html+='</div>';
    });
    con.innerHTML=html||'<div style="color:var(--text-soft);font-size:.8rem;">Aucun document.</div>';
    const gc=_q('dos-chk-gardiennage');_tglGard(imo,!!(gc?.checked&&!gc?.disabled));
    const oc=_q('dos-chk-overtime');   _tglOt(!!(oc?.checked&&!oc?.disabled));
}

window._dosTglRow=function(imo,id){
    const c=_q(`dos-chk-${id}`);
    if(c&&!c.disabled){c.checked=!c.checked;window._dosChk(imo,id,c.checked);}
};
window._dosChk=function(imo,id,v){
    if(id==='gardiennage')_tglGard(imo,v);
    if(id==='overtime')   _tglOt(v);
};
function _tglGard(imo,s){const b=_q('dos-gard-box');if(b)b.style.display=s?'block':'none';if(s)window._dosUpdAgents(imo);}
function _tglOt(s)      {const b=_q('dos-ot-box');  if(b)b.style.display=s?'block':'none';}

// ─────────────────────────────────────────────────────────────────────────────
// COLLECT DATA
// ─────────────────────────────────────────────────────────────────────────────
function _collect(imo){
    const tpls=[];
    document.querySelectorAll('[id^="dos-chk-"]').forEach(c=>{if(c.checked&&!c.disabled)tpls.push(c.id.replace('dos-chk-',''));});
    const shifts=SHIFTS.filter((_,i)=>_q(`dos-shift-${i}`)?.checked);
    _msave({shipper:_v('dos-shipper'),notify:_v('dos-notify'),from:_v('dos-from'),to:_v('dos-to'),bc:_v('dos-bc'),ste_garde:_v('dos-ste-garde')});
    return {
        imo,port:_v('dos-port'),operation:window._dosCurrentOp||'import',
        vessel_name:_v('dos-vessel'),imo_str:imo,flag:_v('dos-flag'),
        loa:_v('dos-loa'),deadweight:_v('dos-dw'),gross_tonnage:_v('dos-gt'),
        owner:_v('dos-owner'),cargo:_v('dos-cargo'),bl_weight:_v('dos-bl'),
        shipper:_v('dos-shipper'),notify:_v('dos-notify'),
        from:_v('dos-from'),to:_v('dos-to'),bc:_v('dos-bc'),
        arrival_date:_v('dos-arrival'),berthing_date:_v('dos-berthing'),
        departure_date:_v('dos-departure'),date:_v('dos-date'),
        today_date:_td(),
        agent_count:_v('dos-agents')||String(_agents(imo)),
        ste_garde:_v('dos-ste-garde'),
        expimp:(window._dosCurrentOp==='export')?'Export':'Import',
        shift:shifts.join(', '),
        templates:tpls,notes:_v('dos-notes'),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAFT SAVE / LOAD / CLEAR / APPLY
// ─────────────────────────────────────────────────────────────────────────────
window._dosSaveDraft=async function(imo){
    const data=_collect(imo),msg=_q('dos-msg');
    // Sync cargo+bl back to SOF draft
    if(window.sofLoadDraft&&(data.cargo||data.bl_weight)){
        try{
            const sof=(await window.sofLoadDraft(imo))||{};
            let chg=false;
            if(data.cargo&&sof.cargo!==data.cargo){sof.cargo=data.cargo;chg=true;}
            if(data.bl_weight&&sof.bl_weight!==data.bl_weight){sof.bl_weight=data.bl_weight;chg=true;}
            if(chg&&window.S?.currentUser?.access_token)
                window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/sof/draft`,
                    {method:'POST',headers:{'Content-Type':'application/json',
                    'Authorization':`Bearer ${window.S.currentUser.access_token}`},
                    body:JSON.stringify({imo,...sof})},8000).catch(()=>{});
        }catch(_){}
    }
    if(window.S?.currentUser?.access_token){
        try{
            const r=await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/dossier/draft`,
                {method:'POST',headers:{'Content-Type':'application/json',
                'Authorization':`Bearer ${window.S.currentUser.access_token}`},
                body:JSON.stringify({imo,data,notes:data.notes})},8000);
            if(r.ok){
                localStorage.setItem(_dk(imo),JSON.stringify(data));
                if(msg){msg.style.color='var(--success)';msg.textContent='✅ Sauvegardé';}
                setTimeout(()=>{const m=_q('dos-msg');if(m)m.textContent='';},2500);
                return;
            }
        }catch(_){}
    }
    localStorage.setItem(_dk(imo),JSON.stringify(data));
    if(msg){msg.style.color='var(--warning)';msg.textContent='⚠️ Sauvegardé localement';}
    setTimeout(()=>{const m=_q('dos-msg');if(m)m.textContent='';},2500);
};

window._dosLoadDraft=async function(imo){
    if(window.S?.currentUser?.access_token){
        try{
            const r=await window.fetchWithTimeout(
                `${window.CONFIG.WORKER_URL}/dossier/draft?imo=${imo}`,
                {headers:{'Authorization':`Bearer ${window.S.currentUser.access_token}`}},8000);
            if(r.ok){const d=await r.json();if(d.data)return{...d.data,notes:d.notes,_source:'supabase',_updated:d.updated_at};}
        }catch(_){}
    }
    const raw=localStorage.getItem(_dk(imo));
    return raw?{...JSON.parse(raw),_source:'local'}:null;
};

window._dosClear=async function(imo){
    if(!confirm('Effacer et supprimer le brouillon ?'))return;
    if(window.S?.currentUser?.access_token)
        window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/dossier/draft?imo=${imo}`,
            {method:'DELETE',headers:{'Authorization':`Bearer ${window.S.currentUser.access_token}`}},8000).catch(()=>{});
    localStorage.removeItem(_dk(imo));
    window.closeDossier();window.openDossier(imo);
};

function _applyDraft(imo,d){
    const sv=(id,v)=>{const e=_q(id);if(e&&v!=null&&v!=='')e.value=v;};
    sv('dos-vessel',d.vessel_name);sv('dos-flag',d.flag);sv('dos-loa',d.loa);
    sv('dos-dw',d.deadweight);sv('dos-gt',d.gross_tonnage);sv('dos-owner',d.owner);
    sv('dos-cargo',d.cargo);sv('dos-bl',d.bl_weight);sv('dos-shipper',d.shipper);
    sv('dos-notify',d.notify);sv('dos-from',d.from);sv('dos-to',d.to);sv('dos-bc',d.bc);
    sv('dos-arrival',d.arrival_date);sv('dos-berthing',d.berthing_date);
    sv('dos-departure',d.departure_date);sv('dos-date',d.date);
    sv('dos-agents',d.agent_count);sv('dos-ste-garde',d.ste_garde);sv('dos-notes',d.notes);
    if(d.port){sv('dos-port',d.port);window._dosPortChange(imo);}
    if(d.operation)window._dosSetOp(imo,d.operation);
    if(Array.isArray(d.templates)){
        document.querySelectorAll('[id^="dos-chk-"]').forEach(c=>{if(!c.disabled)c.checked=false;});
        d.templates.forEach(id=>{const c=_q(`dos-chk-${id}`);if(c&&!c.disabled)c.checked=true;});
        const gc=_q('dos-chk-gardiennage');_tglGard(imo,!!(gc?.checked));
        const oc=_q('dos-chk-overtime');   _tglOt(!!(oc?.checked));
    }
    if(Array.isArray(d.shifts))
        SHIFTS.forEach((s,i)=>{const c=_q(`dos-shift-${i}`);if(c)c.checked=d.shifts.includes(s)||false;});
    // handle legacy string
    if(typeof d.shift==='string'&&d.shift)
        SHIFTS.forEach((s,i)=>{const c=_q(`dos-shift-${i}`);if(c)c.checked=d.shift.includes(s);});
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDOFF — SEND PICKER
// ─────────────────────────────────────────────────────────────────────────────
window._dosSend=async function(imo){
    if(!window.S?.currentUser?.access_token){window.showToast('Connexion requise','danger');return;}
    _q('dosSendModal')?.remove();
    const pop=document.createElement('div');pop.id='dosSendModal';
    pop.style.cssText='position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;';
    pop.innerHTML=`
        <div style="background:var(--bg-card);border-radius:14px;padding:20px;max-width:380px;width:100%;border:1px solid var(--border);box-shadow:0 20px 60px rgba(0,0,0,.4);">
            <div style="font-weight:700;font-size:.95rem;color:var(--text-main);margin-bottom:14px;">📤 Envoyer Dossier</div>
            <div id="dos-send-list" style="max-height:240px;overflow-y:auto;margin-bottom:10px;"><div style="color:var(--text-soft);font-size:.8rem;">Chargement...</div></div>
            <textarea id="dos-send-notes" class="di" rows="2" placeholder="Notes (optionnel)..." style="margin-bottom:10px;"></textarea>
            <div id="dos-send-msg" style="font-size:.72rem;min-height:18px;margin-bottom:8px;"></div>
            <div style="display:flex;justify-content:flex-end;">
                <button onclick="document.getElementById('dosSendModal')?.remove()" class="btn-ghost" style="padding:8px 14px;font-size:.78rem;">Annuler</button>
            </div>
        </div>`;
    document.body.appendChild(pop);
    pop.addEventListener('click',e=>{if(e.target===pop)pop.remove();});
    try{
        const r=await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/users/list`,
            {headers:{'Authorization':`Bearer ${window.S.currentUser.access_token}`}},8000);
        if(!r.ok)throw new Error('Impossible de charger les utilisateurs');
        const users=await r.json();
        const el=_q('dos-send-list');if(!el)return;
        if(!users.length){el.innerHTML='<div style="color:var(--text-soft);font-size:.8rem;">Aucun collègue.</div>';return;}
        el.innerHTML=users.map(u=>`
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;border:1px solid var(--border);margin-bottom:6px;background:var(--bg-elevated);">
                <span style="font-size:.85rem;color:var(--text-main);">👤 ${window.escapeHtml(u.username)}</span>
                <button class="btn-ghost" style="padding:4px 10px;font-size:.72rem;"
                    onclick="window._dosDoSend('${imo}','${u.id}','${window.escapeHtml(u.username)}')">Envoyer →</button>
            </div>`).join('');
    }catch(e){const el=_q('dos-send-list');if(el)el.innerHTML=`<div style="color:var(--danger);font-size:.8rem;">${e.message}</div>`;}
};

window._dosDoSend=async function(imo,toId,toName){
    const v=window.S?.vesselsDataMap?.get(imo)||{};
    const draft=_collect(imo),notes=_q('dos-send-notes')?.value||'';
    const msgEl=_q('dos-send-msg'),btn=event?.target;
    if(btn)btn.disabled=true;
    if(msgEl){msgEl.style.color='var(--text-soft)';msgEl.textContent='Envoi...';}
    try{
        const r=await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/dossier/handoff/send`,
            {method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${window.S.currentUser.access_token}`},
            body:JSON.stringify({to_user_id:toId,imo,vessel_name:v.name||`IMO ${imo}`,draft_data:draft,notes})},10000);
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        if(msgEl){msgEl.style.color='var(--success)';msgEl.textContent=`✅ Envoyé à ${toName}!`;}
        setTimeout(()=>_q('dosSendModal')?.remove(),1800);
    }catch(e){
        if(msgEl){msgEl.style.color='var(--danger)';msgEl.textContent=`Erreur: ${e.message}`;}
        if(btn)btn.disabled=false;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HANDOFF — POLLING + POPUP
// ─────────────────────────────────────────────────────────────────────────────
window.startDossierHandoffPolling=function(){
    if(window._dosPoll)clearInterval(window._dosPoll);
    window._dosPoll=setInterval(_chkPending,60000);
    _chkPending();
};
window.stopDossierHandoffPolling=function(){clearInterval(window._dosPoll);window._dosPoll=null;};

async function _chkPending(force=false){
    if(!window.S?.currentUser?.access_token)return;
    try{
        const r=await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/dossier/handoff/pending`,
            {headers:{'Authorization':`Bearer ${window.S.currentUser.access_token}`}},8000);
        if(!r.ok)return;
        const data=await r.json(),hs=data.handoffs||[];
        window.S.pendingDossierCount=hs.length;
        window.updateAlertBadge?.();
        if(hs.length>0&&(force||!window._dosShownOnLogin)){window._dosShownOnLogin=true;_showPopup(hs);}
    }catch(_){}
}

function _showPopup(handoffs){
    _q('dosHoOverlay')?.remove();
    const ov=document.createElement('div');ov.id='dosHoOverlay';
    ov.style.cssText='position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;';
    const box=document.createElement('div');
    box.style.cssText='background:var(--bg-card);border-radius:14px;padding:20px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4);border:1px solid var(--border);';
    box.innerHTML=`
        <div style="font-weight:700;font-size:.95rem;margin-bottom:14px;color:var(--text-main);">
            📄 Dossier entrant${handoffs.length>1?'s':''}</div>
        ${handoffs.map(h=>`
        <div id="dos-ho-${h.id}" style="background:var(--bg-elevated);border-radius:10px;padding:12px;margin-bottom:10px;border:1px solid var(--border);">
            <div style="font-weight:700;font-size:.85rem;color:var(--text-main);margin-bottom:4px;">
                <strong style="color:var(--accent);">${window.escapeHtml(h.from_username)}</strong> vous a envoyé un Dossier</div>
            <div style="font-size:.75rem;color:var(--text-soft);margin-bottom:8px;">
                🚢 ${window.escapeHtml(h.vessel_name||'IMO '+h.imo)} · IMO ${h.imo}</div>
            ${h.notes?`<div style="font-size:.75rem;color:var(--text-soft);margin-bottom:8px;font-style:italic;">"${window.escapeHtml(h.notes)}"</div>`:''}
            <div style="display:flex;gap:8px;">
                <button class="btn-primary" style="flex:1;padding:6px;font-size:.78rem;"
                    onclick="window._dosRespond('${h.id}','${h.imo}','accept','${encodeURIComponent(JSON.stringify(h.draft_data))}')">✅ Accepter</button>
                <button class="btn-ghost" style="flex:1;padding:6px;font-size:.78rem;color:var(--danger);"
                    onclick="window._dosRespond('${h.id}','${h.imo}','decline',null)">✕ Refuser</button>
            </div>
        </div>`).join('')}
        <button onclick="document.getElementById('dosHoOverlay')?.remove()" class="btn-ghost" style="width:100%;margin-top:4px;padding:8px;font-size:.78rem;">Fermer</button>`;
    ov.appendChild(box);document.body.appendChild(ov);
    ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
}

window._dosRespond=async function(hoId,imo,action,draftEnc){
    try{
        const r=await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/dossier/handoff/respond`,
            {method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${window.S.currentUser.access_token}`},
            body:JSON.stringify({handoff_id:hoId,action})},10000);
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        _q(`dos-ho-${hoId}`)?.remove();
        if(action==='accept'&&draftEnc){
            const draft=JSON.parse(decodeURIComponent(draftEnc));
            localStorage.setItem(_dk(imo),JSON.stringify(draft));
            window.showToast('📄 Dossier accepté — brouillon sauvegardé','success',4000);
            if(!window.S?.trackedImosCache?.includes(imo)&&window.addVesselByIMO)
                window.addVesselByIMO(imo).catch(()=>{});
        }else window.showToast('Dossier refusé','info',3000);
        window.S.pendingDossierCount=Math.max(0,(window.S.pendingDossierCount||1)-1);
        window.updateAlertBadge?.();
        if(!document.querySelector('[id^="dos-ho-"]'))_q('dosHoOverlay')?.remove();
    }catch(e){window.showToast(`Erreur: ${e.message}`,'danger');}
};

// ─────────────────────────────────────────────────────────────────────────────
// REALTIME
// ─────────────────────────────────────────────────────────────────────────────
window.startDossierRealtimeListener=function(){
    if(!window.S?.currentUser)return;
    if(window._dosChannel){window.supabaseClient?.removeChannel(window._dosChannel);window._dosChannel=null;}
    try{
        if(!window.supabaseClient){
            if(typeof supabase==='undefined')return;
            window.supabaseClient=supabase.createClient('https://rpzcphszvdgjsqnhwdhm.supabase.co','sb_publishable_DXgi3J0tJyM1azdSzGycFQ_l2hsut64');
        }
        const ch=window.supabaseClient.channel(`dossier-${window.S.currentUser.user_id}`);
        window._dosChannel=ch;
        ch.on('postgres_changes',{event:'INSERT',schema:'public',table:'dossier_handoffs',
            filter:`to_user_id=eq.${window.S.currentUser.user_id}`},payload=>{
            const h=payload.new;
            window.showToast(`📄 Dossier de ${h.from_username||'un collègue'} — IMO ${h.imo}`,'success',8000);
            window.S.pendingDossierCount=(window.S.pendingDossierCount||0)+1;
            window.updateAlertBadge?.();
            _chkPending(true);
        });
        ch.subscribe(s=>console.log('[DOSSIER REALTIME]',s));
    }catch(e){console.error('[DOSSIER REALTIME]',e);}
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE
// ─────────────────────────────────────────────────────────────────────────────
window._dosGenerate=async function(imo){
    const data=_collect(imo);
    if(!data.port){window.showToast('Sélectionnez un port','warning');return;}
    if(!data.templates.length){window.showToast('Sélectionnez au moins un document','warning');return;}
    const btn=_q('dos-gen-btn'),msg=_q('dos-msg');
    if(btn){btn.disabled=true;btn.textContent='⏳...';}
    if(msg){msg.style.color='var(--text-soft)';msg.textContent='Génération...';}
    let dots=0;
    const anim=setInterval(()=>{
        dots=(dots%3)+1;const m=_q('dos-msg');
        if(m&&m.textContent.includes('ération'))m.textContent='Génération'+'.'.repeat(dots);
    },500);
    try{
        const r=await window.fetchWithTimeout(`${window.CONFIG.WORKER_URL}/dossier/generate`,
            {method:'POST',headers:{'Content-Type':'application/json',
            ...(window.S.currentUser?.access_token?{'Authorization':`Bearer ${window.S.currentUser.access_token}`}:{})},
            body:JSON.stringify(data)},120000);
        if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.detail||`Erreur ${r.status}`);}
        const blob=await r.blob();
        const fn=`DOSSIER_${(data.vessel_name||'VESSEL').replace(/\s+/g,'_').toUpperCase()}_${data.port.toUpperCase()}_${_td().replace(/-/g,'')}.zip`;
        const url=URL.createObjectURL(blob);
        const a=document.createElement('a');a.href=url;a.download=fn;
        document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
        if(msg){msg.style.color='var(--success)';msg.textContent='✅ Téléchargé!';}
    }catch(e){
        clearInterval(anim);
        if(msg){msg.style.color='var(--danger)';msg.textContent=`❌ ${e.message}`;}
        console.error('[DOSSIER GENERATE]',e);
    }
    clearInterval(anim);
    if(btn){btn.disabled=false;btn.textContent='📥 Download';}
    setTimeout(()=>{const m=_q('dos-msg');if(m)m.textContent='';},4000);
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-START for returning users (session restored before dossier.js loaded)
// ─────────────────────────────────────────────────────────────────────────────
(function(){
    if(window.S?.currentUser?.access_token){
        window.startDossierRealtimeListener();
        window.startDossierHandoffPolling();
        console.log('[DOSSIER] Auto-started for restored session.');
    }
})();

} // end guard
