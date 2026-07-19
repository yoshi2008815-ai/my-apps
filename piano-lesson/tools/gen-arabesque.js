// Generate Arabesque song data from score cells, validate against parsed MIDI.
const fs = require('fs');

// ---- pitch helpers ----
const P = {
  A2:45, B2:47, C3:48, D3:50, E3:52, F3:53, G3:55, Gs3:56, A3:57, B3:59,
  C4:60, Cs4:61, D4:62, Ds4:63, E4:64, F4:65, G4:67, Gs4:68, A4:69, B4:71,
  C5:72, D5:74, E5:76, F5:77, G5:79, A5:81, B5:83, C6:84, D6:86, E6:88,
  F6:89, G6:91, A6:93,
};

// note: {t offset in bar (beats), d dur, m midi, f finger, s staccato, v velocity}
const N = (t,d,m,f,opt={}) => ({t,d,m,f,...opt});

// 5-note 16th run: four 16ths + closing 8th (staccato)
function run(pitches, fingers, v) {
  return pitches.map((m,i) => N(i*0.25, i===4?0.5:0.25, m, fingers[i], i===4?{s:1,v}:{v}));
}
// two staccato quarter chords in one bar
function chords2(pitches, fingers, v) {
  const out = [];
  for (const beat of [0,1]) pitches.forEach((m,i) => out.push(N(beat,1,m,fingers[i],{s:1,v})));
  return out;
}

// ---- RH cells ----
const vP=0.55, vMF=0.7, vF=0.85, vSF=0.95;
const r1 = v=>run([P.A4,P.B4,P.C5,P.B4,P.A4],[1,2,3,2,1],v);
const r2 = v=>run([P.A4,P.B4,P.C5,P.D5,P.E5],[1,2,3,4,5],v);
const r3 = v=>run([P.D5,P.E5,P.F5,P.G5,P.A5],[1,2,3,4,5],v);
const r4 = v=>run([P.A5,P.B5,P.C6,P.D6,P.E6],[1,2,3,4,5],v);
const ans1 = [N(0.5,0.5,P.E5,3,{s:1,v:vMF}), N(1,0.5,P.E5,3,{v:vMF}), N(1.5,0.5,P.F5,4,{v:vMF})];
const ans2 = [N(0,0.5,P.D5,2,{s:1,v:vMF}), N(1,1.5,P.D5,2,{v:vMF})]; // d4~d8 tied
const ans3 = [N(0.5,0.5,P.G5,5,{v:vF}), N(1,0.5,P.D5,2,{v:vMF}), N(1.5,0.5,P.E5,3,{v:vMF})];
const end1 = [N(0,0.5,P.C5,1,{s:1,v:vMF}), N(1,1,P.E5,5,{v:vSF})];
const end2 = [N(0,1,P.C5,1,{v:vMF}), N(1,0.5,P.C6,5,{s:1,v:vF})];
const bDQ = (m1,f1,m2,f2,v)=>[N(0,1.5,m1,f1,{v}), N(1.5,0.5,m2,f2,{v})]; // dotted-quarter + 8th
const b7 = [N(0,0.5,P.D5,1,{v:vMF}),N(0.5,0.5,P.C5,3,{v:vMF}),N(1,0.5,P.B4,2,{v:0.6}),N(1.5,0.5,P.A4,1,{v:0.6})];
const b8 = [N(0,1,P.Gs4,2,{v:0.55}),N(1,1,P.E5,5,{v:0.55})];
const c5b = [N(0.5,0.5,P.B4,2,{s:1,v:vP}),N(1,0.5,P.B4,2,{v:vP}),N(1.5,0.5,P.C5,3,{v:vP})];
const c6b = [N(0,1,P.A4,1,{v:vP}),N(1,1.5,P.E5,5,{v:vP})]; // a4 e'4~e'8
const c7b = [N(0.5,0.5,P.B4,2,{s:1,v:vP}),N(1,0.5,P.B4,2,{v:vP}),N(1.5,0.5,P.C5,3,{v:vP})];
const cEnd1 = [N(0,2,P.A4,1,{v:vP})]; // a2
const k2 = run([P.A5,P.B5,P.C6,P.B5,P.A5],[1,2,3,2,1],vF);
const k3 = run([P.D6,P.E6,P.F6,P.G6,P.A6],[1,2,3,4,5],vF);
const k4 = run([P.E4,P.D4,P.C4,P.B3,P.A3],[5,4,3,2,1],vSF); // risoluto RH low
const k5 = [N(0,2,P.C5,1,{v:vSF}),N(0,2,P.A5,5,{v:vSF})];

// ---- LH cells ----
const Am = v=>chords2([P.A3,P.C4,P.E4],[5,3,1],v);
const Dm = v=>chords2([P.A3,P.D4,P.F4],[5,2,1],v);
const Cma = v=>chords2([P.G3,P.C4,P.E4],[5,3,1],v);
const G7 = v=>chords2([P.G3,P.B3,P.F4],[5,3,1],v);
const Ade = v=>chords2([P.A3,P.D4,P.E4],[5,2,1],v);
const lend1 = [N(0,0.5,P.C4,3,{s:1,v:vMF}),N(0,0.5,P.E4,1,{s:1,v:vMF}),N(1,1,P.E4,1,{v:vSF})];
const lend2 = [N(0,1.5,P.C4,3,{v:vMF}),N(0,1.5,P.E4,1,{v:vMF})];
const lgis = run([P.Gs3,P.A3,P.B3,P.A3,P.Gs3],[3,2,1,2,3],vMF);
const la  = run([P.A3,P.B3,P.C4,P.D4,P.E4],[5,4,3,2,1],vMF);
const lcis = run([P.Cs4,P.D4,P.E4,P.D4,P.Cs4],[3,2,1,2,3],vF);
const lbr1 = [N(0,0.25,P.D4,5,{v:vF}),N(0.25,0.25,P.E4,4,{v:vF}),N(0.5,0.25,P.F4,3,{v:vF}),N(0.75,0.25,P.G4,2,{v:vF}),N(1,0.5,P.A4,1,{v:vF}),N(1.5,0.5,P.G4,2,{v:vF})];
const lbr2 = [N(0,0.5,P.F4,1,{v:vMF}),N(0.5,0.5,P.E4,2,{v:vMF}),N(1,0.5,P.D4,3,{v:0.6}),N(1.5,0.5,P.Ds4,2,{v:0.6})];
const lbr3 = [N(0,0.5,P.E4,1,{v:0.55}),N(0.5,0.5,P.D4,2,{v:0.55}),N(1,0.5,P.C4,3,{v:0.5}),N(1.5,0.5,P.B3,4,{v:0.5})];
const lkrun = run([P.E3,P.D3,P.C3,P.B2,P.A2],[1,2,3,4,5],vSF);
const lfinal = [N(0,2,P.A3,5,{v:vSF}),N(0,2,P.E4,1,{v:vSF})];

// ---- assemble timeline: array of [rhCells, lhCells] per bar (2 beats/bar) ----
function Apass(ending) {
  return [
    [r1(vP), Am(vP)], [r2(vP), Am(vP)], [r3(vP), Dm(0.65)], [r4(vF), Am(vF)],
    [ans1, Cma(vMF)], [ans2, G7(vMF)], [ans3, G7(vMF)],
    ending==='1st' ? [end1, lend1] : [end2, lend2],
  ];
}
function Bpass() {
  return [
    [bDQ(P.E5,5,P.B4,2,vF), lgis], [bDQ(P.C5,3,P.A4,1,vF), la],
    [bDQ(P.E5,5,P.B4,2,vF), lgis], [bDQ(P.C5,3,P.A4,1,vF), la],
    [bDQ(P.A5,5,P.E5,2,vSF), lcis], [bDQ(P.F5,3,P.E5,2,vF), lbr1],
    [b7, lbr2], [b8, lbr3],
  ];
}
function Cpass(ending) {
  return [
    [r1(vP), Am(vP)], [r2(vP), Am(vP)], [r3(vP), Dm(0.65)], [r4(vF), Am(vF)],
    [c5b, Ade(vP)], [c6b, Am(vP)], [c7b, Ade(vP)],
    ending==='1st' ? [cEnd1, Am(vP)] : [r1(vMF), Am(vMF)],
  ];
}
const coda = [
  [r3(vF), Dm(vF)], [k2, Am(vF)], [k3, Dm(vF)], [k4, lkrun], [k5, lfinal],
];

const bars = [
  [[], Am(vP)], [[], Am(vP)],           // intro bars 1-2
  ...Apass('1st'), ...Apass('2nd'),      // A + repeat
  ...Bpass(), ...Cpass('1st'),           // B + A'
  ...Bpass(), ...Cpass('2nd'),           // repeat of B + A'
  ...coda,
];

// sections (bar index 0-based, performed timeline)
const sections = [
  { name: 'イントロ', bar: 0 },
  { name: 'Aパート',   bar: 2 },
  { name: 'Aパート（くり返し）', bar: 10 },
  { name: 'Bパート',   bar: 18 },
  { name: "A'パート",  bar: 26 },
  { name: 'Bパート（くり返し）', bar: 34 },
  { name: "A'パート（くり返し）", bar: 42 },
  { name: 'コーダ',    bar: 50 },
];

const notes = [];
bars.forEach(([rh, lh], bi) => {
  for (const n of rh) notes.push({ t: bi*2 + n.t, d: n.d, m: n.m, h: 'R', f: n.f, v: n.v ?? 0.7, ...(n.s?{s:1}:{}) });
  for (const n of lh) notes.push({ t: bi*2 + n.t, d: n.d, m: n.m, h: 'L', f: n.f, v: n.v ?? 0.7, ...(n.s?{s:1}:{}) });
});
notes.sort((a,b)=>a.t-b.t || a.m-b.m);

// ---- validate against MIDI ----
const buf = fs.readFileSync(process.argv[2] || 'arabesque.mid');
let pos = 0;
function readStr(n){ const s = buf.toString('latin1', pos, pos+n); pos += n; return s; }
function readU32(){ const v = buf.readUInt32BE(pos); pos += 4; return v; }
function readU16(){ const v = buf.readUInt16BE(pos); pos += 2; return v; }
function readU8(){ return buf[pos++]; }
function readVar(){ let v = 0; for(;;){ const b = readU8(); v = (v<<7)|(b&0x7f); if(!(b&0x80)) return v; } }
readStr(4); readU32(); readU16(); const ntrks = readU16(); const div = readU16();
const midiNotes = [];
for (let t = 0; t < ntrks; t++) {
  readStr(4); const len = readU32(); const end = pos + len;
  let tick = 0, running = 0; const open = {};
  while (pos < end) {
    tick += readVar();
    let status = buf[pos];
    if (status & 0x80) { pos++; running = status; } else { status = running; }
    const type = status & 0xf0;
    if (type === 0x90 || type === 0x80) {
      const note = readU8(), vel = readU8();
      if (type === 0x90 && vel > 0) (open[note] = open[note]||[]).push(tick);
      else { const st = (open[note]||[]).shift(); if (st !== undefined) midiNotes.push({beat: st/div, m: note, h: t===0?'R':'L'}); }
    } else if (type===0xA0||type===0xB0||type===0xE0) pos+=2;
    else if (type===0xC0||type===0xD0) pos+=1;
    else if (status===0xFF){ readU8(); const l=readVar(); pos+=l; }
    else if (status===0xF0||status===0xF7){ const l=readVar(); pos+=l; }
  }
}
const key = n => `${n.h}:${Math.round(n.beat!==undefined?n.beat*4:n.t*4)}:${n.m}`;
const midiSet = new Map();
midiNotes.forEach(n => midiSet.set(key(n), (midiSet.get(key(n))||0)+1));
const genSet = new Map();
notes.forEach(n => genSet.set(key(n), (genSet.get(key(n))||0)+1));
let ok = true;
for (const [k,c] of midiSet) if ((genSet.get(k)||0)!==c){ console.log('MISSING in gen:', k, 'midi count', c, 'gen', genSet.get(k)||0); ok=false; }
for (const [k,c] of genSet) if ((midiSet.get(k)||0)!==c){ console.log('EXTRA in gen:', k, 'gen count', c, 'midi', midiSet.get(k)||0); ok=false; }
console.log(`midi notes: ${midiNotes.length}, generated: ${notes.length}, match: ${ok ? 'PERFECT' : 'FAILED'}`);
if (!ok) process.exit(1);

// ---- emit songs.js ----
const song = {
  id: 'arabesque',
  title: 'アラベスク',
  composer: 'ブルグミュラー Op.100-2',
  timeSig: [2,4],
  scoreTempo: 152,
  defaultTempo: 80,
  beatsPerBar: 2,
  totalBeats: bars.length*2,
  sections,
  notes,
};
const js = `// 自動生成: ブルグミュラー「アラベスク」Op.100-2（パブリックドメイン）
// 音符データは Mutopia Project 校訂版 (Collection Litolff) と照合検証済み。
// t=拍位置, d=長さ(拍), m=MIDIノート番号, h=手(R/L), f=指番号, v=強さ, s=スタッカート
window.SONGS = [
${JSON.stringify(song, null, 0).replace(/"([a-zA-Z_]+)":/g, '$1:')}
];
`;
fs.writeFileSync(process.argv[3] || 'songs.js', js);
console.log('wrote songs.js,', notes.length, 'notes,', bars.length, 'bars');
