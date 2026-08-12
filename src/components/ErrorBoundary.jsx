import { Component } from 'react';

// Sin esto, cualquier error durante el render (no solo en el inicio de
// sesión) deja la página completamente en blanco, sin ningún rastro para
// diagnosticar — React desmonta todo el árbol en cuanto algo lanza una
// excepción durante el render y no hay ningún componente que lo capture.
// Con este límite de error, en vez de una pantalla en blanco se ve el
// mensaje y el detalle técnico, que se puede mandar en una captura.
export default class ErrorBoundary extends Component {
  constructor(props){
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error){
    return { error };
  }
  componentDidCatch(error, info){
    console.error('Error de la aplicación:', error, info);
  }
  render(){
    if(this.state.error){
      const detalle = this.state.error && (this.state.error.stack || this.state.error.message || String(this.state.error));
      return (
        <div style={{padding:'40px 24px', fontFamily:'Inter, sans-serif', maxWidth:680, margin:'40px auto', color:'#1c2624'}}>
          <h1 style={{color:'#004941', fontSize:22, marginBottom:8}}>Algo salió mal</h1>
          <p style={{color:'#5c6b68', lineHeight:1.6}}>
            La aplicación encontró un error inesperado y no pudo continuar. Recarga la página —
            si el problema sigue, manda una captura de este mensaje a soporte.
          </p>
          <pre style={{background:'#f4f4f2', padding:16, borderRadius:8, overflow:'auto', fontSize:12.5, whiteSpace:'pre-wrap', border:'1px solid #e4e4e1'}}>{detalle}</pre>
          <button
            onClick={() => {
              // No usa location.reload(): si el error venía acompañado de un
              // "#code=..." pegado en la URL (una respuesta de inicio de
              // sesión de Microsoft a medio procesar), recargar la misma URL
              // tal cual puede volver a intentar procesar ese mismo código y
              // trabar otra vez. Se navega limpio a la dirección base — eso
              // además regresa directo al menú principal (Dashboard), ya que
              // esa es la vista con la que arranca la app.
              window.location.href = window.location.origin + window.location.pathname;
            }}
            style={{marginTop:16, padding:'10px 22px', background:'#004941', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14}}
          >
            Volver al inicio
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
