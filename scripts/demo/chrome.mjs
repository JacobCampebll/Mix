/* The demo's own on-screen furniture: a cursor, a lower-third caption, and
 * full-screen title cards. Injected into the page, appended to <body> so it
 * survives renderForm() rewriting #sections. */
export const CHROME_CSS = `
#dmcur{position:fixed;left:-99px;top:-99px;width:26px;height:26px;margin:-13px 0 0 -13px;z-index:2147483000;
  pointer-events:none;transition:left .75s cubic-bezier(.33,0,.15,1),top .75s cubic-bezier(.33,0,.15,1);}
#dmcur i{position:absolute;inset:0;border-radius:50%;background:rgba(255,255,255,.92);
  border:2px solid #002050;box-shadow:0 2px 10px rgba(0,0,0,.35);display:block;}
#dmcur.press i{transform:scale(.72);transition:transform .12s;}
#dmcur b{position:absolute;inset:0;border-radius:50%;border:2px solid #1C7CC0;opacity:0;display:block;}
#dmcur.press b{animation:dmping .55s ease-out;}
@keyframes dmping{0%{transform:scale(.7);opacity:.9}100%{transform:scale(3.1);opacity:0}}
#dmcap{position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(10px);z-index:2147482000;
  max-width:min(900px,88vw);padding:13px 24px;border-radius:12px;background:rgba(0,32,80,.95);
  color:#fff;font:500 19px/1.45 'Public Sans',system-ui,sans-serif;text-align:center;
  box-shadow:0 10px 34px rgba(0,0,0,.3);opacity:0;transition:opacity .45s,transform .45s;pointer-events:none;}
#dmcap.on{opacity:1;transform:translateX(-50%) translateY(0);}
#dmcap em{font-style:normal;color:#FFC312;}
#dmtitle{position:fixed;inset:0;z-index:2147483600;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:14px;background:linear-gradient(160deg,#002050 0%,#083860 62%,#0a4675 100%);
  opacity:0;transition:opacity .6s;pointer-events:none;text-align:center;padding:0 8vw;}
#dmtitle.on{opacity:1;}
#dmtitle .k{font:600 12px/1 'Roboto Mono',monospace;letter-spacing:.34em;text-transform:uppercase;color:#5FB2E4;}
#dmtitle .t{font:600 58px/1.08 'Space Grotesk',system-ui,sans-serif;color:#fff;letter-spacing:-.01em;}
#dmtitle .t em{font-style:normal;color:#FFC312;}
#dmtitle .s{font:400 22px/1.5 'Public Sans',system-ui,sans-serif;color:rgba(255,255,255,.82);max-width:760px;}
#dmtitle .r{width:74px;height:4px;border-radius:2px;background:#FFC312;margin-top:4px;}
#dmspot{position:fixed;z-index:2147481000;border-radius:12px;pointer-events:none;opacity:0;
  box-shadow:0 0 0 3px #FFC312,0 0 0 9999px rgba(0,16,40,.42);transition:opacity .4s,left .5s,top .5s,width .5s,height .5s;}
#dmspot.on{opacity:1;}
`;

export function chromeScript() {
  return `(() => {
  const mk = (h) => { const d = document.createElement("div"); d.innerHTML = h; return d.firstElementChild; };
  const cur = mk('<div id="dmcur"><i></i><b></b></div>');
  const cap = mk('<div id="dmcap"></div>');
  const spot = mk('<div id="dmspot"></div>');
  const title = mk('<div id="dmtitle"><div class="k"></div><div class="t"></div><div class="r"></div><div class="s"></div></div>');
  [cur, cap, spot, title].forEach((e) => document.body.appendChild(e));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__dm = {
    move(x, y) { cur.style.left = x + "px"; cur.style.top = y + "px"; },
    async press() { cur.classList.add("press"); await sleep(560); cur.classList.remove("press"); },
    park() { cur.style.left = "-99px"; cur.style.top = "-99px"; },
    caption(html) { if (!html) { cap.classList.remove("on"); return; } cap.innerHTML = html; cap.classList.add("on"); },
    spot(sel, pad = 8) {
      if (!sel) { spot.classList.remove("on"); return; }
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      if (!el) { spot.classList.remove("on"); return; }
      const r = el.getBoundingClientRect();
      spot.style.left = (r.left - pad) + "px"; spot.style.top = (r.top - pad) + "px";
      spot.style.width = (r.width + pad * 2) + "px"; spot.style.height = (r.height + pad * 2) + "px";
      spot.classList.add("on");
    },
    title(kicker, t, s) {
      title.querySelector(".k").textContent = kicker || "";
      title.querySelector(".t").innerHTML = t || "";
      title.querySelector(".s").innerHTML = s || "";
      title.classList.add("on");
    },
    untitle() { title.classList.remove("on"); },
    rect(sel) {
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, h: r.height };
    },
    scrollTo(y, ms = 900) {
      return new Promise((res) => {
        const s0 = window.scrollY, d = y - s0, t0 = performance.now();
        if (Math.abs(d) < 2) return res();
        const f = (t) => {
          const k = Math.min(1, (t - t0) / ms);
          const e = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
          window.scrollTo(0, s0 + d * e);
          k < 1 ? requestAnimationFrame(f) : res();
        };
        requestAnimationFrame(f);
      });
    },
    async center(sel, ms = 900, bias = 0.36) {
      const el = typeof sel === "string" ? document.querySelector(sel) : sel;
      if (!el) return;
      const r = el.getBoundingClientRect();
      await window.__dm.scrollTo(Math.max(0, window.scrollY + r.top - window.innerHeight * bias), ms);
    },
  };
})();`;
}
