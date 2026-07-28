import { useLexaraApp } from './hooks/useLexaraApp';
import LoginScreen from './components/LoginScreen';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import DashboardView from './components/DashboardView';
import ProcesosView from './components/ProcesosView';
import ClientesView from './components/ClientesView';
import SetupView from './components/SetupView';
import ProcesoDrawer from './components/ProcesoDrawer';
import ClienteDrawer from './components/ClienteDrawer';

export default function App(){
  const app = useLexaraApp();

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

  return (
    <div id="app" className="active">
      <Sidebar
        view={app.view}
        onGoView={app.setView}
        account={app.account}
        liveMode={app.liveMode}
        onSignOut={app.signOut}
      />
      <div className="main">
        <Topbar
          view={app.view}
          liveMode={app.liveMode}
          searchQuery={app.searchQuery}
          onSearch={app.onSearch}
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
            onOpenCliente={app.openCliente}
            onDeleteCliente={app.deleteCliente}
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
    </div>
  );
}
