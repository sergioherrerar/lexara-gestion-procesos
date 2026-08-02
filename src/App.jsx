import { useState } from 'react';
import { useLexaraApp } from './hooks/useLexaraApp';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import DashboardView from './components/DashboardView';
import ProcesosView from './components/ProcesosView';
import ClientesView from './components/ClientesView';
import FacturacionView from './components/FacturacionView';
import OrdenesCompraView from './components/OrdenesCompraView';
import SetupView from './components/SetupView';
import ProcesoDrawer from './components/ProcesoDrawer';
import ClienteDrawer from './components/ClienteDrawer';
import FacturaDrawer from './components/FacturaDrawer';
import OrdenCompraDrawer from './components/OrdenCompraDrawer';

export default function App(){
  const app = useLexaraApp();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if(!app.appActive){
    return (
      <LoginScreen
        config={app.config}
        onSignIn={app.signIn}
        onEnterDemo={() => app.enterDemo()}
        onGoSetup={app.goSetup}
      />
    );
  }

  function goView(view){
    app.setView(view);
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

        {app.view === 'dashboard' && <DashboardView procesos={app.procesos} />}
        {app.view === 'procesos' && (
          <ProcesosView
            procesos={app.procesos}
            currentFilter={app.currentFilter}
            setFilter={app.setFilter}
            searchQuery={app.searchQuery}
            onOpenProceso={app.openProceso}
          />
        )}
        {app.view === 'clientes' && (
          <ClientesView
            clientes={app.clientes}
            procesos={app.procesos}
            searchQuery={app.searchQuery}
            onOpenCliente={app.openCliente}
            onDeleteCliente={app.deleteCliente}
          />
        )}
        {app.view === 'facturacion' && (
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
        {app.view === 'ordenesCompra' && (
          <OrdenesCompraView
            ordenesCompra={app.ordenesCompra}
            clientes={app.clientes}
            procesos={app.procesos}
            facturas={app.facturas}
            searchQuery={app.searchQuery}
            onOpenOrdenCompra={app.openOrdenCompra}
            onCreateOrdenCompra={app.newOrdenCompra}
            onPrintOrdenCompra={app.printOrdenCompra}
          />
        )}
        {app.view === 'setup' && (
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
        liveMode={app.liveMode}
        onClose={app.closeDrawer}
        onSave={app.saveProceso}
        onCreateCliente={app.createCliente}
      />
      <ClienteDrawer
        cliente={app.activeCliente}
        liveMode={app.liveMode}
        onClose={app.closeClienteDrawer}
        onSave={app.saveCliente}
        onDelete={app.deleteCliente}
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
      />
    </div>
  );
}
