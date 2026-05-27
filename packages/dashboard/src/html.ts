import type { RouteDefinition, SecurityEvent } from '@thekairojs/kairo'

const RISK_COLOR: Record<string, string> = {
  critical: '#ff4444',
  high: '#ff8800',
  medium: '#ffcc00',
  low: '#44cc44',
}

function riskBadge(risk?: string): string {
  const color = RISK_COLOR[risk ?? ''] ?? '#888'
  const label = risk ?? '—'
  return `<span style="background:${color};color:#000;padding:1px 6px;border-radius:3px;font-size:11px;">${label}</span>`
}

function routeRow(r: RouteDefinition): string {
  const opts = r.options
  return `<tr>
    <td><span class="method ${r.method.toLowerCase()}">${r.method}</span></td>
    <td class="mono">${escHtml(r.path)}</td>
    <td>${riskBadge(opts.risk)}</td>
    <td class="mono" style="color:#aaa">${escHtml(opts.intent ?? '—')}</td>
    <td class="mono" style="color:#aaa">${escHtml(opts.trust ?? '—')}</td>
  </tr>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderDashboard(routes: readonly RouteDefinition[], mountPath: string): string {
  const routeRows = routes.map(routeRow).join('\n')
  const eventsUrl = `${mountPath}/events`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KAIRO Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0f;color:#d4d4d4;font-family:monospace;font-size:13px;line-height:1.5}
header{background:#111;border-bottom:1px solid #1e1e2e;padding:12px 24px;display:flex;align-items:center;gap:12px}
header h1{font-size:18px;color:#7c7cff;letter-spacing:2px}
header .sub{color:#555;font-size:11px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0;height:calc(100vh - 49px)}
.panel{border-right:1px solid #1e1e2e;overflow:hidden;display:flex;flex-direction:column}
.panel-head{background:#111;padding:8px 16px;border-bottom:1px solid #1e1e2e;color:#7c7cff;font-size:11px;letter-spacing:1px;text-transform:uppercase}
table{width:100%;border-collapse:collapse}
th{background:#111;padding:6px 10px;text-align:left;color:#555;font-size:11px;position:sticky;top:0}
td{padding:5px 10px;border-bottom:1px solid #1a1a2e;vertical-align:middle}
tr:hover td{background:#111}
.mono{font-family:monospace}
.method{padding:1px 5px;border-radius:3px;font-size:11px;font-weight:bold}
.get{background:#1a3a1a;color:#44cc44}.post{background:#3a1a1a;color:#ff6655}
.put{background:#3a2a1a;color:#ffaa44}.delete{background:#3a1a1a;color:#ff4444}
.patch{background:#1a1a3a;color:#4488ff}.head,.options{background:#2a2a2a;color:#888}
#events{flex:1;overflow-y:auto;padding:8px 0}
.ev{padding:4px 16px;border-bottom:1px solid #0f0f1a;font-size:12px;display:flex;gap:10px}
.ev .ts{color:#444;flex-shrink:0;font-size:10px;padding-top:2px}
.ev .type{flex-shrink:0;color:#7c7cff}
.ev .detail{color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ev.ghost_route_hit .type{color:#ff8800}
.ev.entropy_spike .type{color:#ff4444}
.ev.lattice_denied .type{color:#ff6655}
.ev.canary_triggered .type{color:#ffcc00}
.scroll{overflow-y:auto;flex:1}
.empty{padding:24px;color:#333;text-align:center}
</style>
</head>
<body>
<header>
  <h1>⬡ KAIRO</h1>
  <div class="sub">security dashboard · v1.1</div>
</header>
<div class="grid">
  <div class="panel">
    <div class="panel-head">Routes (${routes.length})</div>
    <div class="scroll">
      <table>
        <thead><tr><th>Method</th><th>Path</th><th>Risk</th><th>Intent</th><th>Trust</th></tr></thead>
        <tbody id="routes">${routeRows || '<tr><td colspan="5" class="empty">No routes registered</td></tr>'}</tbody>
      </table>
    </div>
  </div>
  <div class="panel">
    <div class="panel-head">Live Security Events</div>
    <div id="events"><div class="empty">Waiting for events…</div></div>
  </div>
</div>
<script>
(function(){
  var el=document.getElementById('events');
  var es=new EventSource('${eventsUrl}');
  var first=true;
  es.onmessage=function(e){
    try{
      var ev=JSON.parse(e.data);
      if(first){el.innerHTML='';first=false;}
      var d=document.createElement('div');
      d.className='ev '+(ev.type||'');
      var ts=new Date(ev.timestamp).toLocaleTimeString();
      d.innerHTML='<span class="ts">'+ts+'</span><span class="type">'+ev.type+'</span><span class="detail">'+escHtml(ev.route+' — '+ev.detail)+'</span>';
      el.prepend(d);
      if(el.children.length>200)el.removeChild(el.lastChild);
    }catch(e){}
  };
  es.onerror=function(){
    if(es.readyState===2){setTimeout(function(){location.reload()},3000);}
  };
  function escHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
})();
</script>
</body>
</html>`
}
