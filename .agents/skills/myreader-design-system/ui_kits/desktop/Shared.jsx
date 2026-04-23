// MyReader Desktop — Shared Components
// Exported to window for cross-script access

const BOOKS = [
  { id:1, title:'The Name of the Rose', author:'Umberto Eco',      pct:62, format:'EPUB', color:'#3A2818', color2:'#1E1208', synced:true  },
  { id:2, title:'百年孤独',              author:'加西亚·马尔克斯',  pct:28, format:'EPUB', color:'#1A3040', color2:'#0D1E28', synced:false },
  { id:3, title:'Dune',                  author:'Frank Herbert',    pct: 8, format:'EPUB', color:'#2A1A40', color2:'#180E28', synced:true  },
  { id:4, title:'三体',                  author:'刘慈欣',            pct: 0, format:'EPUB', color:'#0D2830', color2:'#061418', synced:true  },
  { id:5, title:'Normal People',         author:'Sally Rooney',    pct:44, format:'EPUB', color:'#2A3A20', color2:'#161E10', synced:true  },
  { id:6, title:'海边的卡夫卡',          author:'村上春树',          pct:91, format:'EPUB', color:'#3A2A10', color2:'#1E1408', synced:false },
  { id:7, title:'Crime and Punishment',  author:'Dostoevsky',      pct: 0, format:'PDF',  color:'#2A1010', color2:'#180808', synced:true  },
  { id:8, title:'东方快车谋杀案',        author:'阿加莎·克里斯蒂',  pct:55, format:'EPUB', color:'#1A2840', color2:'#0D1420', synced:true  },
];

function BookCover({ book, size = 'md', onClick }) {
  const w = size === 'sm' ? 80 : size === 'lg' ? 140 : 110;
  const h = Math.round(w * 1.44);
  return (
    <div onClick={onClick} style={{
      width: w, height: h, borderRadius: 10, cursor:'pointer', position:'relative', overflow:'hidden', flexShrink: 0,
      background: `linear-gradient(145deg, ${book.color}, ${book.color2})`,
      boxShadow: '2px 4px 16px rgba(28,23,20,.22), 0 1px 3px rgba(28,23,20,.14)',
      transition: 'transform 200ms cubic-bezier(0.25,0.1,0.25,1), box-shadow 200ms',
    }}
    onMouseEnter={e => { e.currentTarget.style.transform='scale(1.025)'; e.currentTarget.style.boxShadow='3px 6px 22px rgba(28,23,20,.30)'; }}
    onMouseLeave={e => { e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='2px 4px 16px rgba(28,23,20,.22), 0 1px 3px rgba(28,23,20,.14)'; }}
    >
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:6, background:'rgba(0,0,0,.28)', borderRadius:'10px 0 0 10px' }}/>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', justifyContent:'flex-end', padding:10 }}>
        <div style={{ fontFamily:'Lora,serif', fontSize: size==='sm'?9:11, fontWeight:600, color:'rgba(255,255,255,.88)', lineHeight:1.3 }}>{book.title}</div>
        <div style={{ fontFamily:'DM Sans,sans-serif', fontSize: size==='sm'?8:10, color:'rgba(255,255,255,.5)', marginTop:3 }}>{book.author}</div>
      </div>
      {book.pct > 0 && (
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:3, background:'rgba(255,255,255,.15)' }}>
          <div style={{ height:'100%', width:`${book.pct}%`, background:'rgba(255,255,255,.7)', borderRadius:'0 2px 2px 0' }}/>
        </div>
      )}
    </div>
  );
}

function SyncDot({ synced }) {
  return (
    <span style={{
      display:'inline-block', width:7, height:7, borderRadius:'50%',
      background: synced ? '#3A7D5A' : '#C4922D',
      marginRight: 4, flexShrink: 0,
    }}/>
  );
}

function Icon({ name, size=18, color='currentColor', spin=false }) {
  const icons = {
    library: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    sync: <><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></>,
    chevronLeft: <polyline points="15 18 9 12 15 6"/>,
    chevronRight: <polyline points="9 18 15 12 9 6"/>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>,
    list: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>,
    sun: <><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></>,
    close: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    cloud: <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>,
    folder: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      style={spin ? { animation:'spin 1.2s linear infinite' } : {}}>
      {icons[name]}
    </svg>
  );
}

Object.assign(window, { BOOKS, BookCover, SyncDot, Icon });
