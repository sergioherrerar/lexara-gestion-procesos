// Comportamiento del menú principal de Lexara en las páginas estáticas (botón de hamburguesa en el celular y submenú «Servicios»).
(function(){
  'use strict';
  var barra = document.getElementById('menu-sitio');
  if(!barra) return;
  var burger = barra.querySelector('.msitio-burger');
  var subBtn = barra.querySelector('.msitio-sub-btn');
  var subLi = subBtn ? subBtn.parentNode : null;

  function abrirSub(si){ if(!subLi) return; subLi.classList.toggle('sub-abierto', si); subBtn.setAttribute('aria-expanded', si ? 'true' : 'false'); }
  function abrirMenu(si){ barra.classList.toggle('abierto', si); if(burger){ burger.setAttribute('aria-expanded', si ? 'true' : 'false'); burger.setAttribute('aria-label', si ? 'Cerrar el menú' : 'Abrir el menú'); } if(!si) abrirSub(false); }

  if(burger) burger.addEventListener('click', function(){ abrirMenu(!barra.classList.contains('abierto')); });
  if(subBtn) subBtn.addEventListener('click', function(ev){ ev.preventDefault(); abrirSub(!subLi.classList.contains('sub-abierto')); });
  document.addEventListener('click', function(ev){
    if(subLi && !subLi.contains(ev.target)) abrirSub(false);
    if(barra.classList.contains('abierto') && !barra.contains(ev.target)) abrirMenu(false);
  });
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape'){ abrirSub(false); abrirMenu(false); } });
  window.addEventListener('resize', function(){ if(window.innerWidth > 980) abrirMenu(false); });
})();
