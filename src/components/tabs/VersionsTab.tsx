import React from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { loadConfig, saveConfig, ConfigData, getVersionsDir } from "../../lib/config.js";
import { listVersions, switchVersion, uninstallVersion, checkLatestVersion, installVersion, getTotalVersionsSize, VersionInfo } from "../../lib/versions.js";
import { formatSize } from "../../lib/models.js";

type FocusArea = "list" | "actions" | "edit";
type Action = "switch" | "uninstall" | "check" | "install";

export default function VersionsTab() {
  const [config, setConfig] = React.useState<ConfigData | null>(null);
  const [versions, setVersions] = React.useState<VersionInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [focusArea, setFocusArea] = React.useState<FocusArea>("list");
  const [actionIndex, setActionIndex] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState<string | null>(null);
  const [installing, setInstalling] = React.useState(false);
  const [installProgress, setInstallProgress] = React.useState(0);
  const [installLabel, setInstallLabel] = React.useState("");
  const [editValue, setEditValue] = React.useState("");
  const [totalSize, setTotalSize] = React.useState(0);

  React.useEffect(() => {
    loadConfig().then(async (c) => {
      setConfig(c);
      const vs = await listVersions(c);
      setVersions(vs);
      const size = await getTotalVersionsSize(c);
      setTotalSize(size);
      setLoading(false);
    });
  }, []);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  const actions: Action[] = ["switch", "uninstall", "check", "install"];

  const handleSwitch = async () => {
    if (!config || selectedIndex >= versions.length) return;
    const v = versions[selectedIndex];
    try {
      const newConfig = await switchVersion(config, v.version);
      await saveConfig(newConfig);
      setConfig(newConfig);
      setVersions((prev) => prev.map((x) => ({ ...x, active: x.version === v.version })));
      showMessage(`Active version: ${v.version}`);
    } catch (err: any) {
      showMessage(`Switch failed: ${err.message}`);
    }
  };

  const handleUninstall = async () => {
    if (!config || selectedIndex >= versions.length) return;
    const v = versions[selectedIndex];
    if (v.active) {
      showMessage("Cannot uninstall active version");
      return;
    }
    try {
      await uninstallVersion(config, v.version);
      const newConfig = { ...config };
      await saveConfig(newConfig);
      setConfig(newConfig);
      const vs = await listVersions(newConfig);
      setVersions(vs);
      setSelectedIndex(0);
      const size = await getTotalVersionsSize(newConfig);
      setTotalSize(size);
      showMessage(`Uninstalled ${v.version}`);
    } catch (err: any) {
      showMessage(`Uninstall failed: ${err.message}`);
    }
  };

  const handleCheckUpdates = async () => {
    try {
      const latest = await checkLatestVersion();
      showMessage(`Latest release: ${latest}`);
    } catch (err: any) {
      showMessage(`Check failed: ${err.message}`);
    }
  };

  const handleInstall = async () => {
    if (!config || !editValue.trim()) return;
    const version = editValue.trim();
    setInstalling(true);
    setInstallProgress(0);
    setInstallLabel("Starting...");
    try {
      await installVersion(config, version, (pct, label) => {
        setInstallProgress(pct);
        setInstallLabel(label);
      });
      const vs = await listVersions(config);
      setVersions(vs);
      const newConfig = { ...config, activeVersion: version };
      await saveConfig(newConfig);
      setConfig(newConfig);
      const size = await getTotalVersionsSize(newConfig);
      setTotalSize(size);
      showMessage(`Installed ${version}`);
    } catch (err: any) {
      showMessage(`Install failed: ${err.message}`);
    } finally {
      setInstalling(false);
      setInstallProgress(0);
      setInstallLabel("");
    }
  };

  useInput((input, key) => {
    if (installing) return;

    if (focusArea === "edit") {
      if (key.return) {
        handleInstall();
      } else if (input === "\u0003") {
        setFocusArea("actions");
      }
      return;
    }

    if (focusArea === "actions") {
      if (input === "h" || key.leftArrow) {
        setActionIndex((prev) => Math.max(prev - 1, 0));
      } else if (input === "l" || key.rightArrow) {
        setActionIndex((prev) => Math.min(prev + 1, actions.length - 1));
      } else if (key.return) {
        const action = actions[actionIndex];
        if (action === "switch") handleSwitch();
        else if (action === "uninstall") handleUninstall();
        else if (action === "check") handleCheckUpdates();
        else if (action === "install") {
          setFocusArea("edit");
          setEditValue("");
        }
      } else if (input === "k" || key.upArrow) {
        setFocusArea("list");
      }
      return;
    }

    if (focusArea === "list") {
      if (input === "k" || key.upArrow) {
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (input === "j" || key.downArrow) {
        setSelectedIndex((prev) => Math.min(prev + 1, versions.length - 1));
      } else if (key.return) {
        setFocusArea("actions");
        setActionIndex(0);
      }
    }
  });

  if (loading) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box paddingTop={1}>
          <Text color="gray">Loading versions...</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" borderStyle="single" borderColor="gray">
        <Box flexDirection="row" justifyContent="space-between">
          <Box>
            <Text bold>Versions</Text>
            <Text> {" │ "} </Text>
            <Text color="gray">{versions.length} installed</Text>
          </Box>
          <Box>
            <Text color="gray">{formatSize(totalSize)} used</Text>
          </Box>
        </Box>
        <Box>
          <Text color="gray">Dir: </Text>
          <Text color="blue">{config ? getVersionsDir(config) : "<unknown>"}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray" wrap="wrap">
          j/k navigate │ Enter select │ g actions │ Ctrl+C cancel
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        {versions.length === 0 ? (
          <Box>
            <Text color="gray">No versions installed. Use "install" action to get started.</Text>
          </Box>
        ) : (
          versions.map((v, i) => {
            const isSelected = focusArea === "list" && selectedIndex === i;
            return (
              <Box key={v.version}>
                <Text color={isSelected ? "white" : v.active ? "green" : "gray"} bold={isSelected || v.active}>
                  {v.active ? "● " : "  "}
                </Text>
                <Text color={isSelected ? "white" : "cyan"} bold={isSelected}>
                  {v.version}
                </Text>
                {v.active && (
                  <>
                    <Text> {" "} </Text>
                    <Text color="green">(active)</Text>
                  </>
                )}
              </Box>
            );
          })
        )}
      </Box>

      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray">
        <Box>
          <Text color="gray" bold>Actions:</Text>
        </Box>
        <Box flexDirection="row">
          {actions.map((action, i) => {
            const isActive = focusArea === "actions" && actionIndex === i;
            const label =
              action === "switch" ? "Switch"
                : action === "uninstall" ? "Uninstall"
                  : action === "check" ? "Check Updates"
                    : "Install";
            return (
              <Box key={action} marginRight={1}>
                <Text
                  bold={isActive}
                  color={isActive ? "white" : "cyan"}
                  backgroundColor={isActive ? "white" : undefined}
                >
                  {` ${label} `}
                </Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      {focusArea === "edit" && (
        <Box marginTop={1}>
          <Text color="yellow" bold>Version tag (e.g. b7405): </Text>
          <TextInput value={editValue} onChange={setEditValue} focus />
        </Box>
      )}

      {installing && (
        <Box marginTop={1}>
          <Text color="cyan"><Spinner type="line" /></Text>
          <Text> {" "} </Text>
          <Text color="gray">{installLabel}</Text>
          <Text> {" "} </Text>
          <Text color="gray">({installProgress}%)</Text>
          <Box>
            <Text color="gray">{"█".repeat(Math.round(installProgress / 5))}</Text>
            <Text color="gray">{"░".repeat(20 - Math.round(installProgress / 5))}</Text>
          </Box>
        </Box>
      )}

      {message && (
        <Box marginTop={1}>
          <Text color="green">{` › ${message}`}</Text>
        </Box>
      )}
    </Box>
  );
}
