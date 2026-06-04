import React from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import TextInput from "ink-text-input";
import { loadConfig, saveConfig, ConfigData, getVersionsDir } from "../../lib/config.js";
import { listVersions, switchVersion, uninstallVersion, checkLatestVersion, installVersion, listRecentVersions, getTotalVersionsSize, getAvailableBackends, getPlatformKey, VersionInfo, RemoteVersion, AvailableBackend, BACKEND_LABELS } from "../../lib/versions.js";
import { formatSize } from "../../lib/models.js";
import { useOnClick } from "@ink-tools/ink-mouse";
import { theme } from "../../lib/theme.js";

type FocusArea = "list" | "actions" | "releases" | "backends";
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
        color={isActive ? theme.selectedText : theme.accent}
        backgroundColor={isActive ? theme.selected : undefined}
      >
        {` ${label} `}
      </Text>
    </Box>
  );
}

function VersionRow({ version, isSelected, onClick }: { version: VersionInfo; isSelected: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  const backendLabel = BACKEND_LABELS[version.backend] || version.backend;
  return (
    <Box ref={ref} backgroundColor={isSelected ? theme.selected : undefined}>
      <Text color={isSelected ? theme.selectedText : version.active ? theme.success : theme.textMuted} bold={isSelected || version.active}>
        {version.active ? "● " : "  "}
      </Text>
      <Text color={isSelected ? theme.selectedText : theme.accent} bold={isSelected}>
        {version.tag}
      </Text>
      {version.backend !== "cpu" && version.backend !== "metal" && (
        <>
          <Text> {" "} </Text>
          <Text color={isSelected ? theme.selectedText : theme.warning}>{`[${backendLabel}]`}</Text>
        </>
      )}
      {version.active && !isSelected && (
        <>
          <Text> {" "} </Text>
          <Text color={theme.success}>(active)</Text>
        </>
      )}
      {version.active && isSelected && (
        <>
          <Text> {" "} </Text>
          <Text color={theme.selectedText}>(active)</Text>
        </>
      )}
    </Box>
  );
}

function ReleaseRow({ release, isSelected, isInstalled, onClick }: { release: RemoteVersion; isSelected: boolean; isInstalled: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  return (
    <Box ref={ref} backgroundColor={isSelected ? theme.selected : undefined}>
      <Text color={isSelected ? theme.selectedText : isInstalled ? theme.success : theme.accent} bold={isSelected}>
        {isSelected ? "▸ " : "  "}
      </Text>
      <Text color={isSelected ? theme.selectedText : theme.text} bold={isSelected}>
        {release.tag}
      </Text>
      <Text> {" "} </Text>
      <Text color={isSelected ? theme.selectedText : theme.textMuted}>
        ({formatDate(release.publishedAt)})
      </Text>
      {isInstalled && !isSelected && (
        <>
          <Text> {" "} </Text>
          <Text color={theme.success}>[installed]</Text>
        </>
      )}
      {isInstalled && isSelected && (
        <>
          <Text> {" "} </Text>
          <Text color={theme.selectedText}>[installed]</Text>
        </>
      )}
    </Box>
  );
}

function BackendRow({ backend, isSelected, isInstalled, onClick }: { backend: AvailableBackend; isSelected: boolean; isInstalled: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, onClick);
  return (
    <Box ref={ref} backgroundColor={isSelected ? theme.selected : undefined}>
      <Text color={isSelected ? theme.selectedText : isInstalled ? theme.success : theme.accent} bold={isSelected}>
        {isSelected ? "▸ " : "  "}
      </Text>
      <Text color={isSelected ? theme.selectedText : theme.text} bold={isSelected}>
        {backend.label}
      </Text>
      {isInstalled && !isSelected && (
        <>
          <Text> {" "} </Text>
          <Text color={theme.success}>[installed]</Text>
        </>
      )}
      {isInstalled && isSelected && (
        <>
          <Text> {" "} </Text>
          <Text color={theme.selectedText}>[installed]</Text>
        </>
      )}
    </Box>
  );
}

export default function VersionsTab({ message: _propsMessage, showMessage: _propsShowMessage, setIsTextInputFocused: _propsSetTextInputFocused }: { message: string | null; showMessage: (msg: string) => void; setIsTextInputFocused: (focused: boolean) => void }) {
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
  const [pendingTag, setPendingTag] = React.useState<string | null>(null);
  const [availableBackends, setAvailableBackends] = React.useState<AvailableBackend[]>([]);
  const [backendIndex, setBackendIndex] = React.useState(0);
  const [installedBackends, setInstalledBackends] = React.useState<Record<string, Set<string>>>({});

  const actionsArr: Action[] = ["switch", "uninstall", "check", "install"];

  React.useEffect(() => {
    loadConfig().then(async (c) => {
      setConfig(c);
      const vs = await listVersions(c);
      setVersions(vs);
      const size = await getTotalVersionsSize(c);
      setTotalSize(size);
      setLoading(false);
      const ib: Record<string, Set<string>> = {};
      for (const v of vs) {
        if (!ib[v.tag]) ib[v.tag] = new Set();
        ib[v.tag].add(v.backend);
      }
      setInstalledBackends(ib);
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
  const installedTags = new Set(versions.map((v) => v.tag));

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
      const ib: Record<string, Set<string>> = {};
      for (const vv of vs) {
        if (!ib[vv.tag]) ib[vv.tag] = new Set();
        ib[vv.tag].add(vv.backend);
      }
      setInstalledBackends(ib);
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
    setPendingTag(null);
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

  const openBackendSelection = async (tag: string) => {
    setPendingTag(tag);
    const release = releases.find((r) => r.tag === tag);
    if (release) {
      const backends = getAvailableBackends(tag, getPlatformKey(), release.assets);
      setAvailableBackends(backends);
      setBackendIndex(0);
      setFocusArea("backends");
    } else {
      try {
        const res = await fetch(
          `https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/${tag}`,
          { headers: { "User-Agent": "llama-dashboard" } },
        );
        if (!res.ok) throw new Error(`Failed to fetch release: ${res.status}`);
        const data = await res.json();
        const assets = (data.assets || []).map((a: any) => ({ name: a.name, size: a.size }));
        const backends = getAvailableBackends(tag, getPlatformKey(), assets);
        setAvailableBackends(backends);
        setBackendIndex(0);
        setFocusArea("backends");
      } catch (err: any) {
        showMessage(`Fetch backends failed: ${err.message}`);
      }
    }
  };

  const handleInstall = async (tag: string, backend: string) => {
    if (!config) return;
    setInstalling(true);
    setInstallProgress(0);
    setInstallLabel("Starting...");
    try {
      const folderName = await installVersion(config, tag, backend, (pct, label) => {
        setInstallProgress(pct);
        setInstallLabel(label);
      });
      const vs = await listVersions(config);
      setVersions(vs);
      const newConfig = { ...config, activeVersion: folderName };
      await saveConfig(newConfig);
      setConfig(newConfig);
      const size = await getTotalVersionsSize(newConfig);
      setTotalSize(size);
      const ib: Record<string, Set<string>> = {};
      for (const v of vs) {
        if (!ib[v.tag]) ib[v.tag] = new Set();
        ib[v.tag].add(v.backend);
      }
      setInstalledBackends(ib);
      showMessage(`Installed ${folderName}`);
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

    if (focusArea === "backends") {
      if (input === "k" || key.upArrow) {
        setBackendIndex((prev) => Math.max(prev - 1, 0));
      } else if (input === "j" || key.downArrow) {
        setBackendIndex((prev) => Math.min(prev + 1, availableBackends.length - 1));
      } else if (key.return) {
        const backend = availableBackends[backendIndex];
        if (backend && pendingTag) handleInstall(pendingTag, backend.id);
      } else if (input === "g") {
        setFocusArea("releases");
        setPendingTag(null);
      }
      return;
    }

    if (focusArea === "releases") {
      if (editMode) {
        if (key.return) {
          openBackendSelection(editValue.trim());
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
        if (release) openBackendSelection(release.tag);
      } else if (input === "g") {
        setFocusArea("actions");
        setPendingTag(null);
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
          <Text color={theme.textMuted}>Loading versions...</Text>
        </Box>
      </Box>
    );
  }

  if (focusArea === "backends") {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="column" borderStyle="single" borderColor={theme.border}>
          <Box flexDirection="row" justifyContent="space-between">
            <Box>
              <Text color={theme.text} bold>Select backend</Text>
              <Text> {" "} </Text>
              <Text color={theme.accent}>{pendingTag}</Text>
            </Box>
            <Box>
              <Text color={theme.textMuted}>j/k navigate │ Enter install │ g back</Text>
            </Box>
          </Box>
        </Box>

       <Box flexDirection="column" flexGrow={1} marginTop={1} overflow="hidden">
           {availableBackends.length === 0 ? (
            <Box>
              <Text color={theme.textMuted}>No backends available for this platform.</Text>
            </Box>
          ) : (
            availableBackends.map((b, i) => (
              <BackendRow
                key={b.id}
                backend={b}
                isSelected={backendIndex === i}
                isInstalled={installedBackends[pendingTag!]?.has(b.id) || false}
                onClick={() => {
                  setBackendIndex(i);
                  if (pendingTag) handleInstall(pendingTag, b.id);
                }}
              />
            ))
          )}
        </Box>

        {installing && (
          <Box marginTop={1}>
            <Text color={theme.accent}><Spinner type="line" /></Text>
            <Text> {" "} </Text>
            <Text color={theme.textMuted}>{installLabel}</Text>
            <Text> {" "} </Text>
            <Text color={theme.textMuted}>({installProgress}%)</Text>
            <Box>
              <Text color={theme.accent}>{"█".repeat(Math.round(installProgress / 5))}</Text>
              <Text color={theme.textMuted}>{"░".repeat(20 - Math.round(installProgress / 5))}</Text>
            </Box>
          </Box>
        )}

        {message && (
          <Box marginTop={1}>
            <Text color={theme.success}>{` › ${message}`}</Text>
          </Box>
        )}
      </Box>
    );
  }

  if (focusArea === "releases") {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box flexDirection="column" borderStyle="single" borderColor={theme.border}>
          <Box flexDirection="row" justifyContent="space-between">
            <Box>
              <Text color={theme.text} bold>Install version</Text>
            </Box>
            <Box>
              <Text color={theme.textMuted}>j/k navigate │ Enter select │ g back │ e custom tag</Text>
            </Box>
          </Box>
        </Box>

       <Box flexDirection="column" flexGrow={1} marginTop={1} overflow="hidden">
           {fetchingReleases ? (
            <Box>
              <Text color={theme.accent}><Spinner type="line" /></Text>
              <Text> {" "} </Text>
              <Text color={theme.textMuted}>Fetching releases...</Text>
            </Box>
          ) : releases.length === 0 ? (
            <Box>
              <Text color={theme.textMuted}>Failed to fetch releases. Press e for custom tag or g to go back.</Text>
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
                  openBackendSelection(r.tag);
                }}
              />
            ))
          )}
        </Box>

        {editMode && (
          <Box marginTop={1}>
            <Text color={theme.warning} bold>Custom tag: </Text>
            <TextInput value={editValue} onChange={setEditValue} focus />
          </Box>
        )}

        {installing && (
          <Box marginTop={1}>
            <Text color={theme.accent}><Spinner type="line" /></Text>
            <Text> {" "} </Text>
            <Text color={theme.textMuted}>{installLabel}</Text>
            <Text> {" "} </Text>
            <Text color={theme.textMuted}>({installProgress}%)</Text>
            <Box>
              <Text color={theme.accent}>{"█".repeat(Math.round(installProgress / 5))}</Text>
              <Text color={theme.textMuted}>{"░".repeat(20 - Math.round(installProgress / 5))}</Text>
            </Box>
          </Box>
        )}

        {message && (
          <Box marginTop={1}>
            <Text color={theme.success}>{` › ${message}`}</Text>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box>
            <Text color={theme.text} bold>Versions</Text>
            <Text> {" │ "} </Text>
            <Text color={theme.textMuted}>{versions.length} installed</Text>
          </Box>
          <Box>
            <Text color={theme.textMuted}>{formatSize(totalSize)} used</Text>
          </Box>
        </Box>
        <Box>
          <Text color={theme.textMuted}>Dir: </Text>
          <Text color={theme.textLink}>{config ? getVersionsDir(config) : "<unknown>"}</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color={theme.textMuted} wrap="wrap">
          j/k navigate │ g actions │ h/l action select │ Enter execute │ Ctrl+C cancel
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} marginTop={1} overflow="hidden">
        {versions.length === 0 ? (
          <Box>
            <Text color={theme.textMuted}>No versions installed. Press g for actions → Install.</Text>
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

      <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={theme.border}>
        <Box>
          <Text color={theme.textMuted} bold>Actions:</Text>
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
          <Text color={theme.accent}><Spinner type="line" /></Text>
          <Text> {" "} </Text>
          <Text color={theme.textMuted}>{installLabel}</Text>
          <Text> {" "} </Text>
       <Text color={theme.textMuted}>({installProgress}%)</Text>
            <Box>
              <Text color={theme.accent}>{"█".repeat(Math.round(installProgress / 5))}</Text>
              <Text color={theme.textMuted}>{"░".repeat(20 - Math.round(installProgress / 5))}</Text>
            </Box>
          </Box>
        )}

      {message && (
        <Box marginTop={1}>
          <Text color={theme.success}>{` › ${message}`}</Text>
        </Box>
      )}
    </Box>
  );
}
