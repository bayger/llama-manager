import React from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { loadConfig, saveConfig, ConfigData, getVersionsDir } from "../../lib/config.js";
import { listVersions, switchVersion, uninstallVersion, checkLatestVersion, installVersion, listRecentVersions, getTotalVersionsSize, VersionInfo, RemoteVersion } from "../../lib/versions.js";
import { formatSize } from "../../lib/models.js";
import { useOnClick } from "@ink-tools/ink-mouse";

type FocusArea = "list" | "actions" | "releases";
type Action = "switch" | "uninstall" | "check" | "install";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function ActionButton({ action, isActive, onClick }: { action: Action; isActive: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  const label =
    action === "switch" ? "Switch"
      : action === "uninstall" ? "Uninstall"
        : action === "check" ? "Check Updates"
          : "Install";
  return (
    <Box marginRight={1} ref={ref}>
      <Text
        bold={isActive}
        color={isActive ? "white" : "cyan"}
        backgroundColor={isActive ? "white" : undefined}
      >
        {` ${label} `}
      </Text>
    </Box>
  );
}

function VersionRow({ version, isSelected, onClick }: { version: VersionInfo; isSelected: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  return (
    <Box ref={ref}>
      <Text color={isSelected ? "white" : version.active ? "green" : "gray"} bold={isSelected || version.active}>
        {version.active ? "● " : "  "}
      </Text>
      <Text color={isSelected ? "white" : "cyan"} bold={isSelected}>
        {version.version}
      </Text>
      {version.active && (
        <>
          <Text> {" "} </Text>
          <Text color="green">(active)</Text>
        </>
      )}
    </Box>
  );
}

function ReleaseRow({ release, isSelected, isInstalled, onClick }: { release: RemoteVersion; isSelected: boolean; isInstalled: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  return (
    <Box ref={ref}>
      <Text color={isSelected ? "white" : isInstalled ? "green" : "cyan"} bold={isSelected}>
        {isSelected ? "▸ " : "  "}
      </Text>
      <Text color={isSelected ? "white" : "white"} bold={isSelected}>
        {release.tag}
      </Text>
      <Text> {" "} </Text>
      <Text color={isSelected ? "gray" : "gray"}>
        ({formatDate(release.publishedAt)})
      </Text>
      {isInstalled && (
        <>
          <Text> {" "} </Text>
          <Text color="green">[installed]</Text>
        </>
      )}
    </Box>
  );
}

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
  const [releases, setReleases] = React.useState<RemoteVersion[]>([]);
  const [releaseIndex, setReleaseIndex] = React.useState(0);
  const [fetchingReleases, setFetchingReleases] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);

  const actionsArr: Action[] = ["switch", "uninstall", "check", "install"];

  React.useEffect(() => {
    loadConfig().then(async (c) => {
      setConfig(c);
      const vs = await listVersions(c);
      setVersions(vs);
      const size = await getTotalVersionsSize(c);
      setTotalSize(size);
      setLoading(false);
      if (vs.length === 0) {
        setFocusArea("actions");
        setActionIndex(3);
      }
    });
  }, []);

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 4000);
  };

  const actions: Action[] = actionsArr;
  const installedTags = new Set(versions.map((v) => v.version));

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

  const openInstall = async () => {
    setFetchingReleases(true);
    setFocusArea("releases");
    setReleaseIndex(0);
    try {
      const recent = await listRecentVersions(20);
      setReleases(recent);
    } catch (err: any) {
      showMessage(`Fetch failed: ${err.message}`);
      setFocusArea("actions");
    } finally {
      setFetchingReleases(false);
    }
  };

  const handleInstall = async (tag: string) => {
    if (!config) return;
    setInstalling(true);
    setInstallProgress(0);
    setInstallLabel("Starting...");
    try {
      await installVersion(config, tag, (pct, label) => {
        setInstallProgress(pct);
        setInstallLabel(label);
      });
      const vs = await listVersions(config);
      setVersions(vs);
      const newConfig = { ...config, activeVersion: tag };
      await saveConfig(newConfig);
      setConfig(newConfig);
      const size = await getTotalVersionsSize(newConfig);
      setTotalSize(size);
      showMessage(`Installed ${tag}`);
      setFocusArea("list");
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

    if (focusArea === "releases") {
      if (editMode) {
        if (key.return) {
          handleInstall(editValue.trim());
        } else if (input === "\u0003") {
          setEditMode(false);
        }
        return;
      }
      if (fetchingReleases) return;
      if (input === "k" || key.upArrow) {
        setReleaseIndex((prev) => Math.max(prev - 1, 0));
      } else if (input === "j" || key.downArrow) {
        setReleaseIndex((prev) => Math.min(prev + 1, releases.length - 1));
      } else if (key.return) {
        const release = releases[releaseIndex];
        if (release) handleInstall(release.tag);
      } else if (input === "g") {
        setFocusArea("actions");
      } else if (input === "e") {
        setEditMode(true);
        setEditValue("");
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
        else if (action === "install") openInstall();
      } else if (input === "k" || key.upArrow) {
        if (versions.length > 0) {
          setFocusArea("list");
        }
      } else if (input === "j" || key.downArrow) {
        setFocusArea("list");
      }
      return;
    }

    if (focusArea === "list") {
      if (input === "g") {
        setFocusArea("actions");
        setActionIndex(0);
      } else if (input === "k" || key.upArrow) {
        if (selectedIndex > 0) {
          setSelectedIndex((prev) => prev - 1);
        } else {
          setFocusArea("actions");
          setActionIndex(actions.length - 1);
        }
      } else if (input === "j" || key.downArrow) {
        if (versions.length === 0) {
          setFocusArea("actions");
          setActionIndex(0);
        } else if (selectedIndex < versions.length - 1) {
          setSelectedIndex((prev) => prev + 1);
        }
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

  if (focusArea === "releases") {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="column" borderStyle="single" borderColor="gray">
          <Box flexDirection="row" justifyContent="space-between">
            <Box>
              <Text bold>Install version</Text>
            </Box>
            <Box>
              <Text color="gray">j/k navigate │ Enter install │ g back │ e custom tag</Text>
            </Box>
          </Box>
        </Box>

        <Box flexDirection="column" flexGrow={1} marginTop={1}>
          {fetchingReleases ? (
            <Box>
              <Text color="cyan"><Spinner type="line" /></Text>
              <Text> {" "} </Text>
              <Text color="gray">Fetching releases...</Text>
            </Box>
          ) : releases.length === 0 ? (
            <Box>
              <Text color="gray">Failed to fetch releases. Press e for custom tag or g to go back.</Text>
            </Box>
          ) : (
            releases.map((r, i) => (
              <ReleaseRow
                key={r.tag}
                release={r}
                isSelected={releaseIndex === i}
                isInstalled={installedTags.has(r.tag)}
                onClick={() => {
                  setReleaseIndex(i);
                  handleInstall(r.tag);
                }}
              />
            ))
          )}
        </Box>

        {editMode && (
          <Box marginTop={1}>
            <Text color="yellow" bold>Custom tag: </Text>
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
          j/k navigate │ g actions │ h/l action select │ Enter execute │ Ctrl+C cancel
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        {versions.length === 0 ? (
          <Box>
            <Text color="gray">No versions installed. Press g for actions → Install.</Text>
          </Box>
        ) : (
          versions.map((v, i) => (
            <VersionRow
              key={v.version}
              version={v}
              isSelected={focusArea === "list" && selectedIndex === i}
              onClick={() => {
                setSelectedIndex(i);
                setFocusArea("actions");
                setActionIndex(0);
              }}
            />
          ))
        )}
      </Box>

      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray">
        <Box>
          <Text color="gray" bold>Actions:</Text>
        </Box>
        <Box flexDirection="row">
          {actions.map((action, i) => (
            <ActionButton
              key={action}
              action={action}
              isActive={focusArea === "actions" && actionIndex === i}
              onClick={() => {
                setFocusArea("actions");
                setActionIndex(i);
                if (action === "switch") handleSwitch();
                else if (action === "uninstall") handleUninstall();
                else if (action === "check") handleCheckUpdates();
                else if (action === "install") openInstall();
              }}
            />
          ))}
        </Box>
      </Box>

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
