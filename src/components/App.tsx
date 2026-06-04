import React from "react";
import { Box, useInput, useApp } from "ink";
import { FullScreenBox } from "fullscreen-ink";
import { MouseProvider } from "@ink-tools/ink-mouse";
import Tabs from "./Tabs.js";
import StatusBar from "./StatusBar.js";
import ServerTab from "./tabs/ServerTab.js";
import TasksTab from "./tabs/TasksTab.js";
import VersionsTab from "./tabs/VersionsTab.js";
import ModelsTab from "./tabs/ModelsTab.js";
import DashboardTab from "./tabs/DashboardTab.js";
import OptionsTab from "./tabs/OptionsTab.js";
import LiveLogsTab from "./tabs/LiveLogsTab.js";
import { loadConfig } from "./../lib/config.js";
import { taskStore } from "./../lib/tasks.js";

const TABS = ["Server", "Tasks", "Versions", "Models", "Dashboard", "Logs", "Options"] as const;
type TabId = (typeof TABS)[number];

const tabComponents: Record<TabId, React.ComponentType<{ message: string | null; showMessage: (msg: string) => void }>> = {
  Server: ServerTab,
  Tasks: TasksTab,
  Versions: VersionsTab,
  Models: ModelsTab,
  Dashboard: DashboardTab,
  Logs: LiveLogsTab,
  Options: OptionsTab,
};

export default function App() {
  const [activeTab, setActiveTab] = React.useState<TabId>("Server");
  const tabIndex = TABS.indexOf(activeTab);
  const handleTabChange = (index: number) => setActiveTab(TABS[index]);
  const ActiveComponent = tabComponents[activeTab];
  const { exit } = useApp();
  const [message, setMessage] = React.useState<string | null>(null);
  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  React.useEffect(() => {
    loadConfig().then((config) => {
      taskStore.init(config);
    });
    return () => {
      taskStore.dispose();
    };
  }, []);

  useInput((input) => {
    if (input === "q") {
      exit();
    }
  });

  return (
    <MouseProvider>
      <FullScreenBox flexDirection="column">
        <Box>
          <Tabs tabs={TABS} selectedIndex={tabIndex} onChange={handleTabChange} />
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          <ActiveComponent message={message} showMessage={showMessage} />
        </Box>
        <Box>
          <StatusBar activeTab={activeTab} message={message} />
        </Box>
      </FullScreenBox>
    </MouseProvider>
  );
}
