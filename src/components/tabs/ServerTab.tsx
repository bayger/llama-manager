import React from "react";
import { Box, Text, useInput } from "ink";
import Spinner from "ink-spinner";
import { loadConfig, saveConfig, ConfigData, PRESET_CATEGORIES, getActivePresets, getActiveFreeFormArgs } from "../../lib/config.js";
import { startServer, stopServer, getStatus, listDevices } from "../../lib/server.js";
import TextInput from "ink-text-input";
import { useOnClick } from "@ink-tools/ink-mouse";
import { theme } from "../../lib/theme.js";

type ServerState = "stopped" | "starting" | "running" | "stopping";
type FocusArea = "controls" | "form";

function ProfileButton({ name, isActive, onClick }: { name: string; isActive: boolean; onClick: () => void }) {
  const ref = React.useRef<React.ComponentRef<typeof Box>>(null);
  useOnClick(ref, () => onClick());
  return (
    <Box ref={ref}>
      <Text
        color={isActive ? theme.selectedText : theme.accent}
        bold={isActive}
        backgroundColor={isActive ? theme.selected : undefined}
      >
        {" "}{name}{" "}
      </Text>
    </Box>
  );
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return "";
  if (type === "boolean") return value ? "on" : "off";
  return String(value);
}

function buildFieldList(config: ConfigData, collapsed: Set<number>) {
  const items: Array<{
    type: "header" | "field";
    categoryIndex: number;
    fieldIndex?: number;
  }> = [];
  for (let ci = 0; ci < PRESET_CATEGORIES.length; ci++) {
    items.push({ type: "header", categoryIndex: ci });
    if (!collapsed.has(ci)) {
      for (let fi = 0; fi < PRESET_CATEGORIES[ci].fields.length; fi++) {
        items.push({ type: "field", categoryIndex: ci, fieldIndex: fi });
      }
    }
  }
  return items;
}

export default function ServerTab({ message, showMessage, setIsTextInputFocused }: { message: string | null; showMessage: (msg: string) => void; setIsTextInputFocused: (focused: boolean) => void }) {
  const [config, setConfig] = React.useState<ConfigData | null>(null);
  const [serverState, setServerState] = React.useState<ServerState>("stopped");
  const [pid, setPid] = React.useState<number | null>(null);
  const [uptime, setUptime] = React.useState(0);
  const [focusArea, setFocusArea] = React.useState<FocusArea>("controls");
  const [controlIndex, setControlIndex] = React.useState(0);
  const [collapsed, setCollapsed] = React.useState<Set<number>>(new Set());
const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const [editMode, setEditMode] = React.useState(false);
  const [editKey, setEditKey] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState("");
  const [devicesOutput, setDevicesOutput] = React.useState<string | null>(null);

  const canStart = serverState === "stopped";
  const canStop = serverState === "running";
  const profileNames = config ? Object.keys(config.server.profiles) : [];

  const controlRefs = React.useRef<React.RefObject<React.ComponentRef<typeof Box>>[]>([]);
  const headerRefs = React.useRef<React.RefObject<React.ComponentRef<typeof Box>>[]>([]);
  const fieldRowRefs = React.useRef<React.RefObject<React.ComponentRef<typeof Box>>[]>([]);

  controlRefs.current = Array.from({ length: 7 }, (_, i) => controlRefs.current[i] || React.createRef());
  headerRefs.current = PRESET_CATEGORIES.map((_, i) => headerRefs.current[i] || React.createRef());
  fieldRowRefs.current = Array.from({ length: PRESET_CATEGORIES.reduce((sum, c) => sum + c.fields.length, 0) }, (_, i) => fieldRowRefs.current[i] || React.createRef());

  controlRefs.current.forEach((ref, i) => {
    useOnClick(ref, () => {
      setControlIndex(i);
      if (i === 0 && canStart) handleStart();
      else if (i === 1 && canStop) handleStop();
      else if (i === 2) { handleStop().then(() => handleStart()); }
      else if (i === 3) handleCreateProfile();
      else if (i === 4) handleRenameProfile();
      else if (i === 5) handleDeleteProfile();
      else if (i === 6) handleListDevices();
    });
  });

 

  headerRefs.current.forEach((ref, i) => {
    useOnClick(ref, () => {
      const headerIndex = fieldList.findIndex((item) => item.type === "header" && item.categoryIndex === i);
      setSelectedIndex(headerIndex);
      setFocusArea("form");
      toggleGroup(i);
    });
  });

  fieldRowRefs.current.forEach((ref, i) => {
    useOnClick(ref, () => {
      const item = fieldOnlyList[i];
      const pos = fieldList.findIndex((fl) => fl.type === "field" && fl.categoryIndex === item.categoryIndex && fl.fieldIndex === item.fieldIndex);
      setSelectedIndex(pos);
      setFocusArea("form");
      if (config && item.fieldIndex !== undefined) {
        const cat = PRESET_CATEGORIES[item.categoryIndex];
        const field = cat.fields[item.fieldIndex];
        if (field.type === "boolean") {
          const current = (getActivePresets(config)[cat.presetKey] as Record<string, unknown>)[field.key];
          setValue(item.categoryIndex, field.key, field.type, String(!current));
        } else if (field.type === "enum" && field.options) {
          const current = (getActivePresets(config)[cat.presetKey] as Record<string, unknown>)[field.key];
          const idx = field.options.indexOf(String(current));
          setValue(item.categoryIndex, field.key, field.type, field.options[(idx + 1) % field.options.length]);
        }
      }
    });
  });

  React.useEffect(() => {
    loadConfig().then((c) => {
      setConfig(c);
      setSelectedIndex(0);
      setCollapsed(new Set([1, 2, 3, 4, 5, 6, 7]));
    });
    const status = getStatus();
    if (status.running) {
      setServerState("running");
      setPid(status.pid);
      setUptime(status.uptime);
    }
  }, []);

  const statusIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  React.useEffect(() => {
    statusIntervalRef.current = setInterval(() => {
      const status = getStatus();
      if (status.running && serverState !== "running") {
        setServerState("running");
        setPid(status.pid);
        setUptime(status.uptime);
      } else if (!status.running && (serverState === "running" || serverState === "starting")) {
        setServerState("stopped");
        setPid(null);
        setUptime(0);
      } else if (status.running) {
        setUptime(status.uptime);
      }
    }, 1000);
    return () => { if (statusIntervalRef.current) clearInterval(statusIntervalRef.current); };
  }, [serverState]);

  const handleStart = async () => {
    if (!config) { showMessage("No config loaded"); return; }
    setServerState("starting");
    try {
      const p = await startServer(config);
      setPid(p);
      setServerState("running");
      showMessage(`Server started (PID ${p})`);
    } catch (err: any) {
      setServerState("stopped");
      showMessage(`Start failed: ${err.message}`);
    }
  };

  const handleStop = async () => {
    setServerState("stopping");
    try {
      await stopServer();
      setPid(null);
      setServerState("stopped");
      showMessage("Server stopped");
    } catch (err: any) {
      showMessage(`Stop failed: ${err.message}`);
    }
  };

  const controls = ["Start", "Stop", "Restart", "Create", "Rename", "Delete", "Devices"];

  const fieldList = config ? buildFieldList(config, collapsed) : [];

  const fieldOnlyList = fieldList.filter((item) => item.type === "field");

  const setValue = (ci: number, key: string, type: string, raw: string) => {
    if (!config) return;
    const cat = PRESET_CATEGORIES[ci];
    const profileName = config.server.activeProfile;
    const profile = config.server.profiles[profileName];
    const presets = { ...profile.presets };
    const category = { ...(presets[cat.presetKey] as Record<string, unknown>) };
    let value: unknown = raw;
    if (type === "number") value = Number(raw);
    else if (type === "boolean") value = raw === "on" || raw === "true";
    category[key] = value;
    presets[cat.presetKey] = category;
    const newProfile = { ...profile, presets, freeFormArgs: profile.freeFormArgs };
    const newProfiles = { ...config.server.profiles, [profileName]: newProfile };
    const newConfig = { ...config, server: { ...config.server, profiles: newProfiles } };
    setConfig(newConfig);
    saveConfig(newConfig);
  };

  const toggleGroup = (ci: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(ci)) next.delete(ci);
      else next.add(ci);
      return next;
    });
  };

  const moveUp = () => {
    setSelectedIndex((prev) => {
      if (prev > 0) return prev - 1;
      return prev;
    });
  };

  const moveDown = () => {
    setSelectedIndex((prev) => {
      if (prev < fieldList.length - 1) return prev + 1;
      return prev;
    });
  };

  const currentItem = fieldList[selectedIndex];

  useInput((input, key) => {
    if (editMode) {
      if (key.return) {
        if (editKey === "createProfile" && config && editValue.trim()) {
          const newName = editValue.trim();
          if (config.server.profiles[newName]) {
            showMessage("Profile already exists");
            setEditMode(false);
            setEditKey(null);
            return;
          }
          const activeProfile = config.server.activeProfile;
          const sourceProfile = config.server.profiles[activeProfile];
          const newProfiles = {
            ...config.server.profiles,
            [newName]: {
              presets: JSON.parse(JSON.stringify(sourceProfile.presets)),
              freeFormArgs: [...sourceProfile.freeFormArgs],
            },
          };
          const newConfig = { ...config, server: { ...config.server, profiles: newProfiles, activeProfile: newName } };
          setConfig(newConfig);
          saveConfig(newConfig);
          showMessage(`Created profile "${newName}"`);
        } else if (editKey === "renameProfile" && config && editValue.trim()) {
          const newName = editValue.trim();
          if (newName === config.server.activeProfile) {
            setEditMode(false);
            setEditKey(null);
            return;
          }
          if (config.server.profiles[newName]) {
            showMessage("Profile already exists");
            setEditMode(false);
            setEditKey(null);
            return;
          }
          const oldName = config.server.activeProfile;
          const profile = config.server.profiles[oldName];
          const newProfiles = { ...config.server.profiles };
          delete newProfiles[oldName];
          newProfiles[newName] = profile;
          const newConfig = { ...config, server: { ...config.server, profiles: newProfiles, activeProfile: newName } };
          setConfig(newConfig);
          saveConfig(newConfig);
          showMessage(`Renamed to "${newName}"`);
        } else if (currentItem && currentItem.type === "field" && config && currentItem.fieldIndex !== undefined) {
          const cat = PRESET_CATEGORIES[currentItem.categoryIndex];
          const field = cat.fields[currentItem.fieldIndex];
          setValue(currentItem.categoryIndex, field.key, field.type, editValue);
          showMessage(`${field.flag} = ${editValue}`);
        }
        setEditMode(false);
        setEditKey(null);
      } else if (input === "\u0003") {
        setEditMode(false);
        setEditKey(null);
      }
      return;
    }

    if (focusArea === "controls") {
      if (input === "l" || key.rightArrow) {
        setControlIndex((prev) => Math.min(prev + 1, controls.length - 1));
      } else if (input === "h" || key.leftArrow) {
        setControlIndex((prev) => Math.max(prev - 1, 0));
      } else if (key.return) {
        if (controlIndex === 0 && canStart) handleStart();
        else if (controlIndex === 1 && canStop) handleStop();
        else if (controlIndex === 2) { handleStop().then(() => handleStart()); }
        else if (controlIndex === 3) handleCreateProfile();
        else if (controlIndex === 4) handleRenameProfile();
        else if (controlIndex === 5) handleDeleteProfile();
        else if (controlIndex === 6) handleListDevices();
      } else if (input === "j" || key.downArrow) {
        setFocusArea("form");
        setSelectedIndex(0);
      }
    } else if (focusArea === "form") {
      if (input === "k" || key.upArrow) {
        if (selectedIndex > 0) {
          moveUp();
        } else {
          setFocusArea("controls");
        }
      } else if (input === "j" || key.downArrow) {
        if (selectedIndex < fieldList.length - 1) {
          moveDown();
        }
      } else if (key.return) {
        if (currentItem) {
          if (currentItem.type === "header") {
            toggleGroup(currentItem.categoryIndex);
          } else if (config && currentItem.fieldIndex !== undefined) {
            const cat = PRESET_CATEGORIES[currentItem.categoryIndex];
            const field = cat.fields[currentItem.fieldIndex];
            if (field.type === "boolean") {
              const current = (getActivePresets(config)[cat.presetKey] as Record<string, unknown>)[field.key];
              setValue(currentItem.categoryIndex, field.key, field.type, String(!current));
            } else if (field.type === "enum" && field.options) {
              const current = (getActivePresets(config)[cat.presetKey] as Record<string, unknown>)[field.key];
              const idx = field.options.indexOf(String(current));
              setValue(currentItem.categoryIndex, field.key, field.type, field.options[(idx + 1) % field.options.length]);
            } else {
              const current = (getActivePresets(config)[cat.presetKey] as Record<string, unknown>)[field.key];
              setEditValue(current !== null && current !== undefined ? String(current) : "");
              setEditMode(true);
            }
          }
        }
      } else if (input === "g") {
        setFocusArea("controls");
      }
    }
  });

  if (!config) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box paddingTop={1}>
          <Text color={theme.textMuted}>Loading config...</Text>
        </Box>
      </Box>
    );
  }

  const host = String(getActivePresets(config).server.host || "127.0.0.1");
  const port = String(getActivePresets(config).server.port || 8080);

  const handleCreateProfile = () => {
    setEditValue("");
    setEditMode(true);
    setEditKey("createProfile");
  };

  const handleRenameProfile = () => {
    if (config) {
      setEditValue(config.server.activeProfile);
      setEditMode(true);
      setEditKey("renameProfile");
    }
  };

  const handleDeleteProfile = () => {
    if (!config || profileNames.length <= 1) {
      showMessage("Cannot delete last profile");
      return;
    }
    const profileName = config.server.activeProfile;
    const newProfiles = { ...config.server.profiles };
    delete newProfiles[profileName];
    const remainingNames = Object.keys(newProfiles);
    const newActive = remainingNames[0];
    const newConfig = { ...config, server: { ...config.server, profiles: newProfiles, activeProfile: newActive } };
    setConfig(newConfig);
    saveConfig(newConfig);
    showMessage(`Deleted profile "${profileName}"`);
  };

  const handleSwitchProfile = (name: string) => {
    if (!config) return;
    const newConfig = { ...config, server: { ...config.server, activeProfile: name } };
    setConfig(newConfig);
    saveConfig(newConfig);
    showMessage(`Switched to "${name}"`);
  };

  const handleListDevices = () => {
    if (!config) return;
    setDevicesOutput("Loading...");
    const output = listDevices(config);
    setDevicesOutput(output);
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="column" borderStyle="single" borderColor={theme.border}>
        <Box flexDirection="row" justifyContent="space-between">
          <Box>
            <Text color={theme.text} bold>Server</Text>
            <Text> {" │ "} </Text>
            <Text color={serverState === "running" ? theme.success : serverState === "starting" || serverState === "stopping" ? theme.warning : theme.danger}>
              {serverState === "starting" || serverState === "stopping"
                ? <><Text color={theme.accent}><Spinner type="line" /></Text> {serverState}</>
                : serverState}
            </Text>
            <Text> {" │ "} </Text>
            {["Start", "Stop", "Restart"].map((label, i) => {
              const isActive = focusArea === "controls" && controlIndex === i;
              const enabled = (i === 0 && canStart) || (i === 1 && canStop) || i === 2;
              return (
                <React.Fragment key={label}>
                  {i > 0 && <Text> {" │ "} </Text>}
                  <Box ref={controlRefs.current[i]}>
                    <Text
                      bold={isActive}
                      color={isActive ? theme.selectedText : enabled ? theme.accent : theme.textMuted}
                      backgroundColor={isActive ? theme.selected : undefined}
                    >
                      {` ${label} `}
                    </Text>
                  </Box>
                </React.Fragment>
              );
            })}
          </Box>
          <Box>
            {pid && <Text color={theme.textMuted}>PID: {pid}</Text>}
            {serverState === "running" && (
              <>
                <Text> {" │ "} </Text>
                <Text color={theme.textMuted}>Uptime: {formatUptime(uptime)}</Text>
              </>
            )}
          </Box>
        </Box>
        <Box>
          <Text color={theme.textMuted}>Version: </Text>
          <Text>{config.activeVersion || "<none>"}</Text>
          <Text> {" │ "} </Text>
          <Text color={theme.textMuted}>URL: </Text>
          <Text color={theme.textLink}>{`http://${host}:${port}`}</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Text color={theme.textMuted} bold>Profile: </Text>
        {profileNames.map((name, i) => {
          const isActive = name === config.server.activeProfile;
          return (
            <React.Fragment key={name}>
              {i > 0 && <Text> {" │ "} </Text>}
              <ProfileButton name={name} isActive={isActive} onClick={() => handleSwitchProfile(name)} />
            </React.Fragment>
          );
        })}
        <Text> {" │ "} </Text>
        {[
          { label: "Create", action: "create" },
          { label: "Rename", action: "rename" },
          { label: "Delete", action: "delete" },
        ].map((btn, i) => {
          const isActive = focusArea === "controls" && controlIndex === 3 + i;
          const enabled = btn.action !== "delete" || profileNames.length > 1;
          return (
            <React.Fragment key={btn.action}>
              {i > 0 && <Text> {" │ "} </Text>}
              <Box ref={controlRefs.current[3 + i]}>
                <Text
                  bold={isActive}
                  color={isActive ? theme.selectedText : enabled ? theme.accent : theme.textMuted}
                  backgroundColor={isActive ? theme.selected : undefined}
                >
                  {` ${btn.label} `}
                </Text>
              </Box>
            </React.Fragment>
          );
        })}
        <Text> {" │ "} </Text>
        <Box>
          <Text
            bold={focusArea === "controls" && controlIndex === 6}
            color={focusArea === "controls" && controlIndex === 6 ? theme.selectedText : theme.accent}
            backgroundColor={focusArea === "controls" && controlIndex === 6 ? theme.selected : undefined}
          >
            {" Devices "}
          </Text>
        </Box>
      </Box>

      {devicesOutput && (
        <Box marginTop={1} borderStyle="single" borderColor={theme.border}>
          <Box>
            <Text color={theme.text} bold>Devices</Text>
          </Box>
          {devicesOutput.split("\n").map((line, i) => (
            <Box key={i}>
              <Text color={theme.textMuted} wrap="wrap">{line}</Text>
            </Box>
          ))}
        </Box>
      )}

      {editMode && editKey && (editKey === "createProfile" || editKey === "renameProfile") && (
        <Box marginTop={1}>
          <Text color={theme.warning} bold>{editKey === "createProfile" ? "New profile: " : "Rename to: "}</Text>
          <TextInput
            value={editValue}
            onChange={setEditValue}
            focus
          />
        </Box>
      )}

      <Box flexDirection="column" flexGrow={1} marginTop={1}>
        <Box marginBottom={1}>
          <Text color={theme.textMuted} wrap="wrap">
            h/l controls │ j/k navigate │ Enter edit/toggle │ g controls │ Ctrl+C cancel edit
          </Text>
        </Box>

        <Box flexDirection="column" flexGrow={1}>
          {PRESET_CATEGORIES.map((cat, ci) => {
            const isCollapsed = collapsed.has(ci);
            const preset = getActivePresets(config)[cat.presetKey] as Record<string, unknown>;

            const headerIndex = fieldList.findIndex((item) => item.type === "header" && item.categoryIndex === ci);
            const isHeaderSelected = focusArea === "form" && selectedIndex === headerIndex && !editMode;

            return (
              <Box key={cat.name} flexDirection="column">
                <Box ref={headerRefs.current[ci]}>
                  <Text
                    color={isHeaderSelected ? theme.selectedText : theme.accent}
                    bold={isHeaderSelected}
                    backgroundColor={isHeaderSelected ? theme.selected : undefined}
                  >
                    {isCollapsed ? "▶" : "▼"} {cat.name} ({cat.fields.length})
                  </Text>
                </Box>
                {!isCollapsed &&
                  cat.fields.map((field, fi) => {
                    const value = preset[field.key];
                    const fieldPos = fieldList.findIndex((item) =>
                      item.type === "field" && item.categoryIndex === ci && item.fieldIndex === fi
                    );
                    const isSelected = focusArea === "form" && selectedIndex === fieldPos && !editMode;
                    const fieldOnlyIndex = fieldOnlyList.findIndex((item) => item.categoryIndex === ci && item.fieldIndex === fi);
                    const isEditing = editMode && selectedIndex === fieldPos;

                    if (isEditing && (field.type === "string" || field.type === "number")) {
                      return (
                        <Box key={field.key} marginLeft={2} ref={fieldOnlyIndex !== -1 ? fieldRowRefs.current[fieldOnlyIndex] : undefined}>
                          <Text color={theme.warning} bold>{field.flag}</Text>
                          <Text> {" "} </Text>
                          <TextInput
                            value={editValue}
                            onChange={setEditValue}
                            focus
                          />
                        </Box>
                      );
                    }

                    return (
                      <Box key={field.key} marginLeft={2} backgroundColor={isSelected ? theme.selected : undefined}>
                        <Text color={isSelected ? theme.selectedText : theme.textMuted} bold={isSelected}>
                          {field.flag}
                        </Text>
                        <Text> {" "} </Text>
                        <Text color={isSelected ? theme.selectedText : value !== field.default ? theme.success : theme.textMuted}>
                          {formatValue(value, field.type) || <Text color={isSelected ? theme.selectedText : theme.textMuted}>&lt;default&gt;</Text>}
                        </Text>
                        {field.type === "enum" && field.options && (
                          <>
                            <Text> {" "} </Text>
                            <Text color={isSelected ? theme.selectedText : theme.textMuted}>{`[${field.options.join("/")}]`}</Text>
                          </>
                        )}
                        {isSelected && (
                          <>
                            <Text> {" "} </Text>
                            <Text color={theme.selectedText}>
                              {field.type === "boolean" ? "[toggle]"
                                : field.type === "enum" ? "[cycle]" : "[edit]"}
                            </Text>
                          </>
                        )}
                      </Box>
                    );
                  })}
              </Box>
            );
          })}

          <Box marginTop={1}>
            <Text color={theme.accent} bold>Free-form args</Text>
            <Text color={theme.textMuted}> (arbitrary flags)</Text>
          </Box>
          {getActiveFreeFormArgs(config).length > 0
            ? getActiveFreeFormArgs(config).map((arg: string, i: number) => (
                <Box key={i} marginLeft={2}>
                  <Text color={theme.textMuted}>{`${i + 1}. `}</Text>
                  <Text color={theme.accent}>{arg}</Text>
                </Box>
              ))
            : (
                <Box marginLeft={2}>
                  <Text color={theme.textMuted}>None configured</Text>
                </Box>
              )}
        </Box>
      </Box>
    </Box>
  );
}
