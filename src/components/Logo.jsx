// Logo vectorial de Lexara: el motivo de los dos chevrones reemplaza la "x" de
// "lexara". Al ser SVG/texto (no una imagen), nunca lleva fondo y se puede
// pintar del color institucional que mejor resalte según dónde se use.
export default function Logo({ color = 'var(--verde-oscuro)', height = 30 }){
  return (
    <div style={{display:'inline-flex', flexDirection:'column', alignItems:'flex-start', lineHeight:1, color}}>
      <div style={{display:'flex', alignItems:'center', fontFamily:'var(--font-display)', fontWeight:700, fontSize:height, letterSpacing:'-0.01em'}}>
        <span>le</span>
        <svg viewBox="0 0 100 100" width={height*0.6} height={height*0.6} style={{margin:'0 -0.01em'}} fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 30 L50 50 L80 30" stroke="currentColor" strokeWidth="16" fill="none" strokeLinecap="square"/>
          <path d="M20 70 L50 50 L80 70" stroke="currentColor" strokeWidth="16" fill="none" strokeLinecap="square"/>
        </svg>
        <span>ara</span>
      </div>
      <div style={{fontFamily:'var(--font-body)', fontSize:height*0.22, fontWeight:700, letterSpacing:'0.28em', marginTop:height*0.1}}>ABOGADOS</div>
    </div>
  );
}
