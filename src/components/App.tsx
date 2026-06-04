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

const TABS = ["Server", "Tasks", "Versions", "Models", "Dashboard", "Options"] as const;
type TabId = (typeof TABS)[number];

const tabComponents: Record<TabId, React.ComponentType> = {
  Server: ServerTab,
  Tasks: TasksTab,
  Versions: VersionsTab,
  Models: ModelsTab,
  Dashboard: DashboardTab,
  Options: OptionsTab,
};

export default function App() {
  const [activeTab, setActiveTab] = React.useState<TabId>("Server");
  const tabIndex = TABS.indexOf(activeTab);
  const handleTabChange = (index: number) => setActiveTab(TABS[index]);
  const ActiveComponent = tabComponents[activeTab];
  const { exit } = useApp();

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
          <ActiveComponent />
        </Box>
        <Box>
          <StatusBar activeTab={activeTab} />
        </Box>
      </FullScreenBox>
    </MouseProvider>
  );
}
