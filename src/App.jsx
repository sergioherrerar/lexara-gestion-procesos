import { useState, useEffect } from 'react';
import { useLexaraApp } from './hooks/useLexaraApp';
import { canAccessView } from './lib/permissions';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import DashboardView from './components/DashboardView';
import InformesView from './components/InformesView';
import ProcesosView from './components/ProcesosView';
import TutelasView from './components/TutelasView';
import ClientesView from './components/ClientesView';
import FacturacionView from './components/FacturacionView';
import OrdenesCompraView from './components/OrdenesCompraView';
import SetupView from './components/SetupView';
import ProcesoDrawer from './components/ProcesoDrawer';
import ClienteDrawer from './components/ClienteDrawer';
import FacturaDrawer from './components/FacturaDrawer';
import OrdenCompraDrawer from './components/OrdenCompraDrawer';
import ColaboradoresView from './components/ColaboradoresView';
import ColaboradorDrawer from './components/ColaboradorDrawer';
import FormaPagoDrawer from './components/FormaPagoDrawer';
import DesistimientoDrawer from './components/DesistimientoDrawer';
import TutelaDrawer from './components/TutelaDrawer';
import { Toast, ConfirmDialog } from './components/Feedback';

export default function App(){
  const app = useLexaraApp();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Si el rol del usuario cambia (o ya estaba en una sección restringida)
  // lo devuelve al Dashboard — no solo se oculta del menú, se bloquea el
  // acceso aunque ya estuviera ahí.
  useEffect(() => {
    if(app.appActive && !canAccessView(app.role, app.view)){
      app.setView('dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.appActive, app.role, app.view]);

  const feedback = (
    <>
      <Toast toast={app.toast} onClose={app.closeToast} />
      <ConfirmDialog confirmState={app.confirmState} onConfirm={app.acceptConfirm} onCancel={app.cancelConfirm} />
    </>
  );

  if(!app.appActive){
    return (
      <>
        <LoginScreen
          config={app.config}
          onSignIn={app.signIn}
          onEnterDemo={() => app.enterDemo()}
          onGoSetup={app.goSetup}
          signingIn={app.signingIn}
        />
        {feedback}
      </>
    );
  }

  function goView(view){
    app.setView(view);
    app.setSearchQuery('');
    setMobileNavOpen(false);
  }

  return (
    <div id="app" className="active">
      <div className={"sidebar-overlay" + (mobileNavOpen ? " active" : "")} onClick={() => setMobileNavOpen(false)}></div>
      <Sidebar
        view={app.view}
        onGoView={goView}
        account={app.account}
        liveMode={app.liveMode}
        accessRole={app.role}
        onSignOut={app.signOut}
        mobileOpen={mobileNavOpen}
      />
      <div className="main">
        <Topbar
          view={app.view}
          liveMode={app.liveMode}
          searchQuery={app.searchQuery}
          onSearch={app.onSearch}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onRefresh={app.refreshData}
          refreshing={app.refreshing}
        />

        {app.view === 'dashboard' && <DashboardView procesos={app.procesos} clientes={app.clientes} facturas={app.facturas} ordenesCompra={app.ordenesCompra} />}
        {app.view === 'informes' && canAccessView(app.role, 'informes') && (
          <InformesView procesos={app.procesos} clientes={app.clientes} facturas={app.facturas} ordenesCompra={app.ordenesCompra} desistimientos={app.desistimientos} />
        )}
        {app.view === 'procesos' && canAccessView(app.role, 'procesos') && (
          <ProcesosView
            procesos={app.procesos}
            currentFilter={app.currentFilter}
            setFilter={app.setFilter}
            searchQuery={app.searchQuery}
            onOpenProceso={app.openProceso}
            onCreateProceso={app.newProceso}
            canWrite={app.canWrite}
          />
        )}
        {app.view === 'tutelas' && canAccessView(app.role, 'tutelas') && (
          <TutelasView
            tutelas={app.tutelas}
            searchQuery={app.searchQuery}
            onOpenTutela={app.openTutela}
            onCreateTutela={app.newTutela}
            onDeleteTutela={app.deleteTutela}
            canWrite={app.canWrite}
          />
        )}
        {app.view === 'clientes' && canAccessView(app.role, 'clientes') && (
          <ClientesView
            clientes={app.clientes}
            procesos={app.procesos}
            searchQuery={app.searchQuery}
            onOpenCliente={app.openCliente}
            onDeleteCliente={app.deleteCliente}
            canWrite={app.canWrite}
          />
        )}
        {app.view === 'facturacion' && canAccessView(app.role, 'facturacion') && (
          <FacturacionView
            facturas={app.facturas}
            clientes={app.clientes}
            procesos={app.procesos}
            searchQuery={app.searchQuery}
            onOpenFactura={app.openFactura}
            onCreateFactura={app.newFactura}
            onPrintFactura={app.printFactura}
          />
        )}
        {app.view === 'ordenesCompra' && canAccessView(app.role, 'ordenesCompra') && (
          <OrdenesCompraView
            ordenesCompra={app.ordenesCompra}
            clientes={app.clientes}
            procesos={app.procesos}
            facturas={app.facturas}
            searchQuery={app.searchQuery}
            onOpenOrdenCompra={app.openOrdenCompra}
            onCreateOrdenCompra={app.newOrdenCompra}
            onPrintOrdenCompra={app.printOrdenCompra}
            onCreateFacturaFromOrdenCompra={app.createFacturaFromOrdenCompra}
          />
        )}
        {app.view === 'colaboradores' && canAccessView(app.role, 'colaboradores') && (
          <ColaboradoresView
            colaboradores={app.colaboradores}
            searchQuery={app.searchQuery}
            onOpenColaborador={app.openColaborador}
            onCreateColaborador={app.newColaborador}
            onDeleteColaborador={app.deleteColaborador}
            canWrite={app.canWrite}
          />
        )}
        {app.view === 'setup' && canAccessView(app.role, 'setup') && (
          <SetupView
            config={app.config}
            saveConfig={app.saveConfig}
            clearConfig={app.clearConfig}
            lists={app.lists}
            updateListMapping={app.updateListMapping}
            testStatus={app.testStatus}
            onTestConnection={app.testConnection}
            onApplyAllMappings={app.applyAllMappings}
            onDownloadMappings={app.downloadAllMappings}
          />
        )}
      </div>

      <ProcesoDrawer
        proceso={app.activeProceso}
        clientes={app.clientes}
        colaboradores={app.colaboradores}
        facturas={app.facturas}
        ordenesCompra={app.ordenesCompra}
        formasPago={app.formasPago}
        desistimientos={app.desistimientos}
        tiposAccion={app.tiposAccion}
        liveMode={app.liveMode}
        onClose={app.closeDrawer}
        onSave={app.saveProceso}
        onNavigateAway={app.rememberReturnToProceso}
        onCreateCliente={app.createCliente}
        onOpenFactura={app.openFactura}
        onPrintFactura={app.printFactura}
        onCreateFactura={app.newFacturaFromProceso}
        onOpenOrdenCompra={app.openOrdenCompra}
        onPrintOrdenCompra={app.printOrdenCompra}
        onCreateOrdenCompra={app.newOrdenCompraFromProceso}
        onOpenFormaPago={app.openFormaPago}
        onCreateFormaPago={app.newFormaPagoFromProceso}
        onOpenDesistimiento={app.openDesistimiento}
        onCreateDesistimiento={app.newDesistimientoFromProceso}
        saving={app.saving}
        canWrite={app.canWrite && !app.procesoViewOnly}
      />
      <ClienteDrawer
        cliente={app.activeCliente}
        liveMode={app.liveMode}
        onClose={app.closeClienteDrawer}
        onSave={app.saveCliente}
        onDelete={app.deleteCliente}
        saving={app.saving}
        canWrite={app.canWrite}
      />
      <FacturaDrawer
        factura={app.activeFactura}
        clientes={app.clientes}
        procesos={app.procesos}
        liveMode={app.liveMode}
        onClose={app.closeFacturaDrawer}
        onSave={app.saveFactura}
        onUpdateCliente={app.updateCliente}
        autoPrint={!!app.activeFactura && app.autoPrintFacturaId === app.activeFactura.id}
        onAutoPrinted={app.clearAutoPrint}
        saving={app.saving}
      />
      <OrdenCompraDrawer
        ordenCompra={app.activeOrdenCompra}
        clientes={app.clientes}
        procesos={app.procesos}
        facturas={app.facturas}
        liveMode={app.liveMode}
        onClose={app.closeOrdenCompraDrawer}
        onSave={app.saveOrdenCompra}
        onUpdateCliente={app.updateCliente}
        autoPrint={!!app.activeOrdenCompra && app.autoPrintOrdenCompraId === app.activeOrdenCompra.id}
        onAutoPrinted={app.clearAutoPrintOrdenCompra}
        saving={app.saving}
      />
      <ColaboradorDrawer
        colaborador={app.activeColaborador}
        liveMode={app.liveMode}
        onClose={app.closeColaboradorDrawer}
        onSave={app.saveColaborador}
        onDelete={app.deleteColaborador}
        saving={app.saving}
        canWrite={app.canWrite}
      />
      <FormaPagoDrawer
        formaPago={app.activeFormaPago}
        procesos={app.procesos}
        facturas={app.facturas}
        liveMode={app.liveMode}
        onClose={app.closeFormaPagoDrawer}
        onSave={app.saveFormaPago}
        onDelete={app.deleteFormaPago}
        saving={app.saving}
        canWrite={app.canWrite}
      />
      <DesistimientoDrawer
        desistimiento={app.activeDesistimiento}
        procesos={app.procesos}
        liveMode={app.liveMode}
        onClose={app.closeDesistimientoDrawer}
        onSave={app.saveDesistimiento}
        onDelete={app.deleteDesistimiento}
        saving={app.saving}
        canWrite={app.canWrite}
      />
      <TutelaDrawer
        tutela={app.activeTutela}
        clientes={app.clientes}
        temas={app.temas}
        valoresEntidad={app.valoresEntidad}
        liveMode={app.liveMode}
        onClose={app.closeTutelaDrawer}
        onSave={app.saveTutela}
        onDelete={app.deleteTutela}
        onCreateTema={app.createTema}
        onSaveTema={app.saveTema}
        onCreateValorEntidad={app.createValorEntidad}
        onSaveValorEntidad={app.saveValorEntidad}
        saving={app.saving}
        canWrite={app.canWrite}
      />
      {feedback}
    </div>
  );
}
