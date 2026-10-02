// Zia's welcome tour (index.html)
(() => {

  const IMG = "https://raw.githubusercontent.com/z1n-k/zia/readme-images/";
  const rows = (n, colors = ["#ececef", "#9d9da3", "#c9c9ce", "#7f7f86", "#b4b4ba"], extra = () => "") =>
    Array.from({ length: n }, (_, i) => `<div class="w-row ${extra(i)}"><span class="w-ico" style="--c:${colors[i % colors.length]}"></span><span class="w-line"></span>${i < 9 ? `<span class="w-key">${i + 1}</span>` : ""}</div>`).join("");

  const WIRES = {
    intro: () => `<div class="stage intro"><div class="light"></div><div class="lockup"><div class="mark">Zia</div></div></div>`,
    whatsnew: () => `<div class="stage intro whatsnew"><div class="light"></div><div class="lockup"><div class="mark">Zia</div><div class="ver">${version}</div></div></div>`,
    star: () => `<div class="stage star"><div class="light"></div>
      <div class="btn2"><div class="l"><span class="si"><i class="spark" style="--a:0deg"></i><i class="spark" style="--a:45deg"></i><i class="spark" style="--a:90deg"></i><i class="spark" style="--a:135deg"></i><i class="spark" style="--a:180deg"></i><i class="spark" style="--a:225deg"></i><i class="spark" style="--a:270deg"></i><i class="spark" style="--a:315deg"></i><svg viewBox="0 0 24 24" class="o"><path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245"/></svg><svg viewBox="0 0 24 24" class="f"><path d="M8.243 7.34l-6.38 .925l-.113 .023a1 1 0 0 0 -.44 1.684l4.622 4.499l-1.09 6.355l-.013 .11a1 1 0 0 0 1.464 .944l5.706 -3l5.693 3l.1 .046a1 1 0 0 0 1.352 -1.1l-1.091 -6.355l4.624 -4.5l.078 -.085a1 1 0 0 0 -.633 -1.62l-6.38 -.926l-2.852 -5.78a1 1 0 0 0 -1.794 0l-2.853 5.78z"/></svg></span><span class="word"><span class="a">Star</span><span class="b">Starred</span></span></div>
      <div class="n"><span class="roll"><span class="a">248</span><span class="b">249</span></span></div></div><svg class="cursor" viewBox="0 0 24 24"><path d="M5.2 3.6c-.7-.3-1.4.4-1.1 1.1l6.9 15.6c.3.8 1.5.7 1.7-.1l1.8-5.6c.1-.3.3-.5.6-.6l5.6-1.8c.8-.2.9-1.4.1-1.7z"/></svg></div>`,
    numbers: () => `<div class="stage seq numbers"><div class="w-sel"></div><div class="w-side">${rows(5)}</div>
      <div class="w-page"><div class="say"><kbd>⌘</kbd><kbd class="d">3</kbd></div></div></div>`,
    undo: () => `<div class="stage seq undo"><div class="w-sel"></div><div class="w-side">${rows(5).replace(/<span class="w-key">\d<\/span>/g, "")}</div>
      <div class="w-page"><div class="say"><kbd>⌘</kbd><kbd>Z</kbd> Reopened</div></div></div>`,
    split: () => `<div class="stage split"><div class="w-side">${rows(4).replace(/<span class="w-key">\d<\/span>/g, "")}</div><div class="w-page"></div>
      <div class="half l"></div><div class="half r"></div>
      <div class="zone l"><svg class="ci" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.75 7.75a2.5 2.5 0 0 1 2.5 -2.5h13.5a2.5 2.5 0 0 1 2.5 2.5v8.5a2.5 2.5 0 0 1 -2.5 2.5h-13.5a2.5 2.5 0 0 1 -2.5 -2.5z"/><path d="M12 5.25v13.5"/></svg><b>Add left split</b></div><div class="zone r"><svg class="ci" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.75 7.75a2.5 2.5 0 0 1 2.5 -2.5h13.5a2.5 2.5 0 0 1 2.5 2.5v8.5a2.5 2.5 0 0 1 -2.5 2.5h-13.5a2.5 2.5 0 0 1 -2.5 -2.5z"/><path d="M12 5.25v13.5"/></svg><b>Add right split</b></div>
      <div class="ghost2"><i></i><u></u></div><svg class="cursor" viewBox="0 0 24 24"><path d="M5.2 3.6c-.7-.3-1.4.4-1.1 1.1l6.9 15.6c.3.8 1.5.7 1.7-.1l1.8-5.6c.1-.3.3-.5.6-.6l5.6-1.8c.8-.2.9-1.4.1-1.7z"/></svg></div>`,
    color: () => `<div class="stage color"><div class="w-side">${rows(4).replace(/<span class="w-key">\d<\/span>/g, "")}</div>
      <div class="body"></div><div class="bar"><span class="url"></span></div><div class="head"></div></div>`,
    folders: () => `<div class="stage folders"><div class="w-page"></div><div class="box"><div class="fhead"><span class="fico"></span>Self Hosting</div><div class="kids">${rows(3, ["#c9c9ce", "#9d9da3", "#ececef"]).replace(/<span class="w-key">\d<\/span>/g, "")}</div></div>
      <div class="w-side after">${rows(2, ["#9d9da3", "#c9c9ce"]).replace(/<span class="w-key">\d<\/span>/g, "")}</div></div>`,
    music: () => `<div class="stage music"><div class="glow"></div><div class="card"></div><div class="art"></div><div class="t1"></div><div class="t2"></div><div class="track"></div><div class="bars"><i></i><i></i><i></i></div></div>`,
    glance: () => `<div class="stage glance"><div class="w-side">${rows(4).replace(/<span class="w-key">\d<\/span>/g, "")}</div><div class="w-page"></div><div class="link"></div><div class="peek"></div></div>`,
    pip: () => `<div class="stage pip"><div class="w-side">${rows(4).replace(/<span class="w-key">\d<\/span>/g, "")}</div><div class="w-page"></div><div class="player"></div></div>`,
    cards: () => `<div class="stage cards"><div class="w-side">${rows(5).replace(/<span class="w-key">\d<\/span>/g, "")}</div><svg class="cursor" viewBox="0 0 24 24"><path d="M5.2 3.6c-.7-.3-1.4.4-1.1 1.1l6.9 15.6c.3.8 1.5.7 1.7-.1l1.8-5.6c.1-.3.3-.5.6-.6l5.6-1.8c.8-.2.9-1.4.1-1.7z"/></svg>
      <div class="hc"><div class="t"></div><div class="u"></div><div class="a"><i><svg class="ci" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(12 12) scale(1.0645) translate(-12.250 -11.750)" stroke-width="1.4091"><path d="M15 4.5l-4 4l-4 1.5l-1.5 1.5l7 7l1.5 -1.5l1.5 -4l4 -4"/><path d="M9 15l-4.5 4.5"/><path d="M14.5 4l5.5 5.5"/></g></svg></i><i><svg class="ci" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.75 7.75a2.5 2.5 0 0 1 2.5 -2.5h13.5a2.5 2.5 0 0 1 2.5 2.5v8.5a2.5 2.5 0 0 1 -2.5 2.5h-13.5a2.5 2.5 0 0 1 -2.5 -2.5z"/><path d="M12 5.25v13.5"/></svg></i><i><svg class="ci" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(12 12) scale(0.8871) translate(-12.320 -12.060)" stroke-width="1.6909"><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5"/></g></svg></i></div></div></div>`,
    address: () => `<div class="stage address"><div class="w-side">${rows(4).replace(/<span class="w-key">\d<\/span>/g, "")}</div><div class="w-page"></div>
      <div class="pop">${["#5ab9f5", "#ececef", "#9d9da3", "#c9c9ce"].map((c, i) => `<div class="r ${i === 0 ? "sel" : ""}"><i style="--c:${c}"></i><u style="width:${[26, 20, 24, 16][i]}cqw"></u></div>`).join("")}</div>
      <div class="bar"><span class="q"></span><span class="caret"></span></div></div>`,
    multiview: () => `<div class="stage multiview"><div class="w-side">${rows(4).replace(/<span class="w-key">\d<\/span>/g, "")}</div>
      <div class="w-page"><div class="v" style="--c:#2c3542"></div><div class="v" style="--c:#35353a"></div><div class="v" style="--c:#2b2b30"></div><div class="v" style="--c:#3a3a40"></div></div></div>`,
    pdf: () => `<div class="stage pdf"><div class="w-side">${rows(4).replace(/<span class="w-key">\d<\/span>/g, "")}</div>
      <div class="pv"><div class="tb"><i></i><i></i><i></i><i></i></div><div class="body"><div class="thumbs"><i class="on"></i><i></i><i></i></div><div class="sheet"><div class="lines"><b></b><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div></div></div></div>`,
    icons: () => `<div class="stage icons"><div class="folders"><div class="fr" data-icon="briefcase"><span class="fi"><span class="ti old"><svg viewBox="0 0 24 24"><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"/></svg></span><span class="ti new"><svg viewBox="0 0 24 24"><path d="M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9"/><path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2"/><path d="M12 12l0 .01"/><path d="M3 13a20 20 0 0 0 18 0"/></svg></span></span><span class="nm">Work</span></div><div class="fr" data-icon="plane"><span class="fi"><span class="ti old"><svg viewBox="0 0 24 24"><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"/></svg></span><span class="ti new"><svg viewBox="0 0 24 24"><path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3l4 7"/></svg></span></span><span class="nm">Travel</span></div><div class="fr" data-icon="music"><span class="fi"><span class="ti old"><svg viewBox="0 0 24 24"><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"/></svg></span><span class="ti new"><svg viewBox="0 0 24 24"><path d="M3 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M13 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M9 17v-13h10v13"/><path d="M9 8h10"/></svg></span></span><span class="nm">Music</span></div><div class="fr" data-icon="wallet"><span class="fi"><span class="ti old"><svg viewBox="0 0 24 24"><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2"/></svg></span><span class="ti new"><svg viewBox="0 0 24 24"><path d="M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12"/><path d="M20 12v4h-4a2 2 0 0 1 0 -4h4"/></svg></span></span><span class="nm">Finance</span></div></div><div class="search"><span class="q"></span><span class="caret"></span></div><div class="ig"><i data-icon="home"><span class="ti"><svg viewBox="0 0 24 24"><path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/></svg></span></i><i data-icon="briefcase"><span class="ti"><svg viewBox="0 0 24 24"><path d="M3 9a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -9"/><path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2"/><path d="M12 12l0 .01"/><path d="M3 13a20 20 0 0 0 18 0"/></svg></span></i><i data-icon="code"><span class="ti"><svg viewBox="0 0 24 24"><path d="M7 8l-4 4l4 4"/><path d="M17 8l4 4l-4 4"/><path d="M14 4l-4 16"/></svg></span></i><i data-icon="camera"><span class="ti"><svg viewBox="0 0 24 24"><path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"/><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></svg></span></i><i data-icon="plane"><span class="ti"><svg viewBox="0 0 24 24"><path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3l4 7"/></svg></span></i><i data-icon="book"><span class="ti"><svg viewBox="0 0 24 24"><path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 6l0 13"/><path d="M12 6l0 13"/><path d="M21 6l0 13"/></svg></span></i><i data-icon="shopping-cart"><span class="ti"><svg viewBox="0 0 24 24"><path d="M4 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M15 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17h-11v-14h-2"/><path d="M6 5l14 1l-1 7h-13"/></svg></span></i><i data-icon="heart"><span class="ti"><svg viewBox="0 0 24 24"><path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"/></svg></span></i><i data-icon="music"><span class="ti"><svg viewBox="0 0 24 24"><path d="M3 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M13 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M9 17v-13h10v13"/><path d="M9 8h10"/></svg></span></i><i data-icon="star"><span class="ti"><svg viewBox="0 0 24 24"><path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245"/></svg></span></i><i data-icon="cloud"><span class="ti"><svg viewBox="0 0 24 24"><path d="M6.657 18c-2.572 0 -4.657 -2.007 -4.657 -4.483c0 -2.475 2.085 -4.482 4.657 -4.482c.393 -1.762 1.794 -3.2 3.675 -3.773c1.88 -.572 3.956 -.193 5.444 1c1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486c0 1.927 -1.551 3.487 -3.465 3.487h-11.878"/></svg></span></i><i data-icon="device-gamepad-2"><span class="ti"><svg viewBox="0 0 24 24"><path d="M12 5h3.5a5 5 0 0 1 0 10h-5.5l-4.015 4.227a2.3 2.3 0 0 1 -3.923 -2.035l1.634 -8.173a5 5 0 0 1 4.904 -4.019h3.4"/><path d="M14 15l4.07 4.284a2.3 2.3 0 0 0 3.925 -2.023l-1.6 -8.232"/><path d="M8 9v2"/><path d="M7 10h2"/><path d="M14 10h2"/></svg></span></i><i data-icon="palette"><span class="ti"><svg viewBox="0 0 24 24"><path d="M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25"/><path d="M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/><path d="M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"/></svg></span></i><i data-icon="wallet"><span class="ti"><svg viewBox="0 0 24 24"><path d="M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12"/><path d="M20 12v4h-4a2 2 0 0 1 0 -4h4"/></svg></span></i><i data-icon="chart-bar"><span class="ti"><svg viewBox="0 0 24 24"><path d="M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6"/><path d="M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10"/><path d="M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14"/><path d="M4 20h14"/></svg></span></i><i data-icon="coffee"><span class="ti"><svg viewBox="0 0 24 24"><path d="M3 14c.83 .642 2.077 1.017 3.5 1c1.423 .017 2.67 -.358 3.5 -1c.83 -.642 2.077 -1.017 3.5 -1c1.423 -.017 2.67 .358 3.5 1"/><path d="M8 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2"/><path d="M12 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2"/><path d="M3 10h14v5a6 6 0 0 1 -6 6h-2a6 6 0 0 1 -6 -6v-5"/><path d="M16.746 16.726a3 3 0 1 0 .252 -5.555"/></svg></span></i><i data-icon="map-pin"><span class="ti"><svg viewBox="0 0 24 24"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0"/></svg></span></i><i data-icon="school"><span class="ti"><svg viewBox="0 0 24 24"><path d="M22 9l-10 -4l-10 4l10 4l10 -4v6"/><path d="M6 10.6v5.4a6 3 0 0 0 12 0v-5.4"/></svg></span></i></div></div>`,
    // 2.83: a glass folder fills a sheet at a time, opens, closes, empties
    glassfolder: () => `<div class="stage glassfolder"><div class="light"></div>
      <div class="gf-tab t1"></div><div class="gf-tab t2"></div><div class="gf-tab t3"></div>
      <div class="gf"><div class="back"></div><div class="sheet s3"></div><div class="sheet s2"></div><div class="sheet s1"></div><div class="front"></div></div>
      <div class="gf-name">Work</div></div>`,
    tabpeek: () => `<div class="stage tabpeek"><div class="w-side">${rows(5, ["#ececef", "#5ab9f5", "#c9c9ce", "#7f7f86", "#b4b4ba"], (i) => (i === 1 ? "sel" : "")).replace(/<span class="w-key">\d<\/span>/g, "")}</div>
      <div class="tp-clip"><div class="tp"></div></div>
      <div class="w-page"><div class="link"></div></div><div class="peek"></div></div>`,
    panels: () => `<div class="stage panels"><div class="w-side">${rows(5).replace(/<span class="w-key">\d<\/span>/g, "")}</div>
      <div class="bm"><div class="in"><div class="bt"></div>${Array.from({ length: 6 }, (_, i) => `<div class="br${i === 2 ? " sub" : ""}"><i></i><u style="width:${[11, 8, 9, 12, 7, 10][i]}cqw"></u></div>`).join("")}</div></div>
      <div class="pp"></div></div>`,
    ink: () => `<div class="stage ink"><div class="bar"><svg viewBox="0 0 24 24"><path d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2z"/><path d="M9 4v16"/></svg><svg viewBox="0 0 24 24"><path d="M15 6l-6 6l6 6"/></svg><svg viewBox="0 0 24 24" class="off"><path d="M9 6l6 6l-6 6"/></svg><svg viewBox="0 0 24 24"><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/></svg>
      <span class="url"><b>journal.page</b> / Morning pages</span></div>
      <div class="body"><i class="h"></i><i class="l"></i><i class="l"></i><i class="l s"></i></div></div>`,
  };

  const FEATURES = {
    intro: { v: WIRES.intro, t: "Welcome to Zia", d: "Dia's look, rebuilt for Zen, plus things neither of them do: tabs you reach by number, a toolbar in each site's colours, four streams in one tab, and a player for whatever's playing." },
    whatsnew: { v: WIRES.whatsnew, t: "What's new in Zia ${version}", d: "You're up to date. Here's what changed since you last looked." },
    star: { v: WIRES.star, t: "Enjoying Zia?", d: "I don't ask for tips or money. If Zia has earned a place in your browser, a star on GitHub is all I'd ask for. It helps other people find it.", gh: true },
    numbers: { v: WIRES.numbers, t: "Numbered tabs", d: "Hold <kbd>⌘</kbd> and every tab shows its number. Type it and let go. Past nine, keep typing: 1 then 2 is tab twelve." },
    undo: { v: WIRES.undo, t: "<kbd>⌘</kbd><kbd>Z</kbd> to undo a close", d: "Works on folders and splits too. They come back where they were, for ten seconds after you close them." },
    split: { v: WIRES.split, t: "Drop cards for splits", d: "Drag a tab over the page and cards show exactly where it'll land. Keep a split you use a lot as a single essential." },
    color: { v: WIRES.color, t: "A toolbar that matches the page", d: "It takes the colour at the top of each site and keeps its text readable on it." },
    folders: { v: WIRES.folders, t: "Folders", d: "Give one a colour or an icon. Hover a closed folder to see what's in it." },
    cards: { v: WIRES.cards, t: "Hover cards", d: "Title, address, and a row of shortcuts: pin, split, copy the link." },
    music: { v: WIRES.music, t: "Now playing", d: "Whatever's making sound gets a small player, lit by its artwork." },
    address: { v: WIRES.address, t: "The address bar", d: "Fewer, clearer results. Keep it at the top of the window or move it to the bottom." },
    multiview: { v: WIRES.multiview, t: "Multiview", d: "Up to four videos or streams, side by side in one tab." },
    pip: { v: WIRES.pip, t: "Picture-in-picture", d: "Throw the player off the edge of the screen. It waits there until you pull it back." },
    pdf: { v: WIRES.pdf, t: "PDFs", d: "A quieter toolbar and a page sidebar that fit with the rest of Zia." },
    glassfolder: { v: WIRES.glassfolder, t: "Glass folders", d: "A folder without an icon of its own is glass, in its colour. It holds a sheet for each tab inside, up to three, so you can see how full it is before you open it." },
    tabpeek: { v: WIRES.tabpeek, t: "A glance, kept in its tab", d: "Glance at a link and a small picture of the page tucks into the tab, as in Dia. Close the glance and it sinks back in." },
    panels: { v: WIRES.panels, t: "Bookmarks and History, beside your tabs", d: "<kbd>⌘</kbd><kbd>B</kbd> and <kbd>⌘</kbd><kbd>⇧</kbd><kbd>H</kbd> slide in as a second sidebar, matched to your tabs row for row." },
    ink: { v: WIRES.ink, t: "The site's own ink", d: "The toolbar's text and buttons take a touch of each site's colour: a soft brown on a cream page, a soft grey on a white one." },
    icons: { v: WIRES.icons, t: "5,166 icons, or your own", d: "Search Tabler's set by what you mean, not what it's called. Or right-click a folder and choose an SVG." },
  };

  const TOURS = {
    install: { eyebrow: "Welcome to Zia", list: ["intro", "numbers", "undo", "split", "color", "folders", "cards", "music", "address", "multiview", "pip", "pdf", "icons", "star"] },
    update: { eyebrow: "New in Zia", list: ["whatsnew", "glassfolder", "tabpeek", "panels", "ink", "star"] },
  };

  // Numbered tabs and undo step through a little story, over and over
  const PAGE_COLORS = ["#2a2a2e", "#36363b", "#26303b", "#303035", "#3b3b40"];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const ROW = 7.8; // row pitch in cqw

  function selectRow(stage, i, rowsList = [...stage.querySelectorAll(".w-side .w-row")]) {
    const shown = rowsList.filter((r) => !r.classList.contains("closed"));
    const pos = shown.indexOf(rowsList[i]);
    stage.querySelector(".w-sel").style.transform = `translateY(${pos * ROW}cqw)`;
    stage.querySelector(".w-page").style.backgroundColor = PAGE_COLORS[i];
  }

  async function numbersLoop(stage) {
    const rowsList = [...stage.querySelectorAll(".w-side .w-row")];
    const say = stage.querySelector(".say");
    const digit = say.querySelector(".d");
    selectRow(stage, 0, rowsList);
    let n = 0;
    const targets = [2, 0, 4, 1];
    while (stage.isConnected) {
      const t = targets[n++ % targets.length];
      await wait(900);
      stage.classList.add("held");
      await wait(500);
      (digit.firstElementChild || digit).textContent = t + 1;
      say.classList.add("on");
      rowsList[t].classList.add("lit");
      await wait(900);
      stage.classList.remove("held");
      say.classList.remove("on");
      rowsList[t].classList.remove("lit");
      selectRow(stage, t, rowsList);
      await wait(700);
    }
  }

  async function undoLoop(stage) {
    const rowsList = [...stage.querySelectorAll(".w-side .w-row")];
    const say = stage.querySelector(".say");
    let n = 0;
    const closes = [1, 3];
    while (stage.isConnected) {
      const c = closes[n++ % closes.length];
      selectRow(stage, c, rowsList);
      await wait(1200);
      rowsList[c].classList.add("closed");
      selectRow(stage, c + 1, rowsList);
      await wait(1300);
      say.classList.add("on");
      await wait(150);
      rowsList[c].classList.remove("closed");
      selectRow(stage, c, rowsList);
      await wait(1100);
      say.classList.remove("on");
      await wait(500);
    }
  }

  async function iconsLoop(stage) {
    const folders = [...stage.querySelectorAll(".fr")];
    const cells = [...stage.querySelectorAll(".ig i")];
    const q = stage.querySelector(".search .q");
    while (stage.isConnected) {
      folders.forEach((f) => f.classList.remove("set", "on"));
      await wait(900);
      for (const f of folders) {
        const name = f.dataset.icon;
        f.classList.add("on");
        for (let i = 1; i <= Math.min(name.length, 6); i++) {
          q.textContent = name.slice(0, i).replace(/-/g, " ");
          await wait(90);
        }
        const cell = cells.find((c) => c.dataset.icon === name);
        cell?.classList.add("hit");
        await wait(500);
        f.classList.add("set");
        await wait(650);
        cell?.classList.remove("hit");
        f.classList.remove("on");
        q.textContent = "";
        await wait(250);
      }
      await wait(1600);
    }
  }

  async function splitLoop(stage) {
    const ghost = stage.querySelector(".ghost2");
    const cursor = stage.querySelector(".cursor");
    while (stage.isConnected) {
      // back to the start without being seen travelling there
      cursor.style.opacity = "0";
      await wait(250);
      ghost.style.transition = cursor.style.transition = "none";
      ghost.style.transform = cursor.style.transform = "";
      ghost.style.opacity = "0";
      stage.classList.remove("drag", "over", "done");
      void stage.offsetWidth;
      ghost.style.transition = cursor.style.transition = "";
      await wait(650);
      cursor.style.opacity = "1";
      ghost.style.opacity = "1";
      await wait(250);
      ghost.style.transform = "translate(22cqw, 6cqw) scale(.9)";
      cursor.style.transform = "translate(22cqw, 6cqw)";
      stage.classList.add("drag");
      await wait(1000);
      ghost.style.transform = "translate(31cqw, 8cqw) scale(.85)";
      cursor.style.transform = "translate(31cqw, 8cqw)";
      await wait(500);
      stage.classList.add("over");
      await wait(900);
      ghost.style.opacity = "0";
      stage.classList.remove("drag", "over");
      stage.classList.add("done");
      await wait(2200);
    }
  }

  async function starLoop(stage) {
    const btn = stage.querySelector(".btn2");
    const cursor = stage.querySelector(".cursor");
    while (stage.isConnected) {
      cursor.style.transition = "none";
      cursor.style.transform = "";
      cursor.style.opacity = "0";
      stage.classList.remove("on", "burst");
      void stage.offsetWidth;
      cursor.style.transition = "";
      await wait(500);
      cursor.style.opacity = "1";
      const b = btn.getBoundingClientRect(), s0 = stage.getBoundingClientRect(), c = cursor.getBoundingClientRect();
      const toX = b.left + b.width * 0.13 - c.left, toY = b.top + b.height * 0.72 - c.top;
      await wait(300);
      cursor.style.transform = `translate(${toX}px, ${toY}px)`;
      await wait(950);
      btn.classList.add("press");
      await wait(130);
      btn.classList.remove("press");
      stage.classList.add("on", "burst");
      await wait(2200);
      cursor.style.opacity = "0";
      await wait(700);
    }
  }

  async function pdfLoop(stage) {
    const thumbs = [...stage.querySelectorAll(".thumbs i")];
    const lines = stage.querySelector(".lines");
    let page = 0;
    while (stage.isConnected) {
      await wait(1900);
      page = (page + 1) % thumbs.length;
      thumbs.forEach((t, i) => t.classList.toggle("on", i === page));
      lines.style.transform = `translateY(${-page * 12}cqw)`;
    }
  }

  function setHTML(el, html) {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    el.replaceChildren(...[...doc.body.childNodes].map((n) => document.adoptNode(n)));
  }

  function trimKeys(root) {
    root.querySelectorAll("kbd, .w-key").forEach((k) => {
      if (!k.firstElementChild) {
        const span = document.createElement("span");
        span.textContent = k.textContent;
        k.replaceChildren(span);
      }
    });
  }

  function startWires(root) {
    trimKeys(root);
    root.querySelectorAll(".stage.numbers").forEach(numbersLoop);
    root.querySelectorAll(".stage.undo").forEach(undoLoop);
    root.querySelectorAll(".stage.icons").forEach(iconsLoop);
    root.querySelectorAll(".stage.split").forEach(splitLoop);
    root.querySelectorAll(".stage.star").forEach(starLoop);
    root.querySelectorAll(".stage.pdf").forEach(pdfLoop);
  }

  // #install on a first install; #update-2.76.0 after a release that asks
  const hash = location.hash.slice(1);
  let mode = hash.startsWith("update") ? "update" : "install";
  // the version the update tour is for, shown as 2.76
  let version = (hash.split("-")[1] || "").split(".").slice(0, 2).join(".") || "";
  const GITHUB = "https://github.com/z1n-k/zia";
  // Inside Zia the page tells Zia what to do with an event (Zia's own
  // functions can't be handed to it); on its own it opens the link itself
  const inZia = location.protocol === "chrome:";
  // three ways, so it gets through however Zen keeps the page apart: an
  // event, a message to the window, and a mark Zia looks for
  function tellZia(action, url) {
    const message = JSON.stringify({ action, url });
    document.dispatchEvent(new CustomEvent("ZiaWelcome", { detail: message }));
    try {
      window.parent.postMessage({ ziaWelcome: message }, "*");
    } catch (err) {}
    document.documentElement.setAttribute("data-zia-welcome", message);
  }
  function openGitHub() {
    if (inZia) tellZia("open", GITHUB);
    else window.open(GITHUB, "_blank", "noopener");
  }
  let at = 0;

  function renderTour() {
    const tour = TOURS[mode];
    const el = document.getElementById("tour");
    setHTML(el, `
      <div class="track">${tour.list.map((key) => {
        const f = FEATURES[key];
        return `<section class="slide"><div class="visual">${f.v()}</div>
          <div class="copy"><div class="title">${f.t.replace("${version}", version)}</div><p class="desc">${f.d}</p></div></section>`;
      }).join("")}</div>
      <div class="foot">
        <div class="count"><span class="at">1</span> / ${tour.list.length}</div>
        <div class="btns"><button class="btn back">Back</button><button class="btn gh" hidden><svg viewBox="0 0 24 24"><path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5"/></svg>Star on GitHub</button><button class="btn primary next">Next</button></div>
      </div>`);
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    const track = el.querySelector(".track");
    const count = tour.list.length;
    const atEl = el.querySelector(".count .at");
    const back = el.querySelector(".back");
    const gh = el.querySelector(".gh");
    gh.addEventListener("click", openGitHub);
    const next = el.querySelector(".next");
    const slides = [...track.children];
    const go = (n) => {
      at = Math.max(0, Math.min(n, count - 1));
      slides.forEach((sl, i) => {
        sl.classList.toggle("cur", i === at);
        sl.classList.toggle("before", i < at);
        sl.classList.toggle("after", i > at);
      });

      // the picture starts from the beginning each time you land on it
      const visual = slides[at].querySelector(".visual");
      setHTML(visual, FEATURES[tour.list[at]].v());
      startWires(visual);
      atEl.textContent = at + 1;
      back.hidden = at === 0;
      gh.hidden = !FEATURES[tour.list[at]].gh;
      next.textContent = at === count - 1 ? "Start browsing" : "Next";
    };
    back.addEventListener("click", () => go(at - 1));
    next.addEventListener("click", () => (at === count - 1 ? done() : go(at + 1)));
    el.goTo = go;
    go(0);
    trimKeys(el);
  }


  // Zia takes the card away when told
  function done() {
    tellZia("done");
  }
  document.querySelector(".scrim").addEventListener("mousedown", (e) => {
    if (!e.target.closest(".deck")) done();
  });
  window.addEventListener("keydown", (e) => {
    const el = document.getElementById("tour");
    if (e.key === "Escape") done();
    if (e.key === "ArrowRight") el.goTo(at + 1);
    if (e.key === "ArrowLeft") el.goTo(at - 1);
  });


  renderTour();
  trimKeys(document.body);
})();
