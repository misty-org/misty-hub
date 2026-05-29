import { useEffect, useMemo } from "react";
import { PluginBrowser } from "@website/pages/Plugins/PluginBrowser";
import type { PluginBrowserEntry } from "@website/pages/Plugins/types";
import { currentPluginPlatform, pluginRootLabel, usePluginsStore } from "@/store/usePluginsStore";
import { useSetupStore } from "@/store/useSetupStore";
import type { PluginEntry } from "@/types/plugins";

function toBrowserEntry(plugin: PluginEntry): PluginBrowserEntry {
  return {
    id: plugin.id,
    name: plugin.name,
    version: plugin.version,
    author: plugin.author,
    overview: plugin.overview,
    installed: plugin.installed,
    enabled: plugin.enabled,
    verified: plugin.verified,
    logoSrc: plugin.logo_path,
    rootLabel: pluginRootLabel(plugin.root),
    capabilities: plugin.capabilities,
    whereItAppears: plugin.where_it_appears,
    permissions: plugin.permissions,
    gettingStarted: plugin.getting_started,
    changelog: plugin.changelog,
    links: plugin.links,
    launcher: plugin.launcher,
  };
}

export default function PluginsPage() {
  const { status } = useSetupStore();
  const {
    actionPluginId,
    error,
    installedPlugins,
    loading,
    loadPlugins,
    marketplacePlugins,
    notice,
    query,
    selectPlugin,
    selectedPluginId,
    setPluginEnabled,
    setQuery,
    uninstallPlugin,
    installPlugin,
  } = usePluginsStore();

  useEffect(() => {
    if (!status) {
      return;
    }

    void loadPlugins(currentPluginPlatform(status.os, status.arch));
  }, [loadPlugins, status]);

  const browserMarketplacePlugins = useMemo(
    () => marketplacePlugins.map(toBrowserEntry),
    [marketplacePlugins],
  );
  const browserInstalledPlugins = useMemo(
    () => installedPlugins.map(toBrowserEntry),
    [installedPlugins],
  );

  return (
    <PluginBrowser
      error={error}
      installedPlugins={browserInstalledPlugins}
      loading={loading || actionPluginId.length > 0}
      marketplacePlugins={browserMarketplacePlugins}
      notice={notice}
      onInstall={(plugin) => {
        const match = marketplacePlugins.find((entry) => entry.id === plugin.id)
          ?? installedPlugins.find((entry) => entry.id === plugin.id);
        if (match) {
          void installPlugin(match);
        }
      }}
      onOpenLink={(url) => window.open(url, "_blank", "noopener,noreferrer")}
      onQueryChange={(value) => {
        setQuery(value);
      }}
      onRefresh={() => {
        if (!status) {
          return;
        }
        void loadPlugins(currentPluginPlatform(status.os, status.arch));
      }}
      onSelect={selectPlugin}
      onToggle={(plugin, enabled) => {
        const match = marketplacePlugins.find((entry) => entry.id === plugin.id)
          ?? installedPlugins.find((entry) => entry.id === plugin.id);
        if (match) {
          void setPluginEnabled(match, enabled);
        }
      }}
      onUninstall={(plugin) => {
        const match = installedPlugins.find((entry) => entry.id === plugin.id)
          ?? marketplacePlugins.find((entry) => entry.id === plugin.id);
        if (match) {
          void uninstallPlugin(match);
        }
      }}
      query={query}
      selectedPluginId={selectedPluginId}
      subtitle="Browse what Misty can do, then install the pieces you want."
      title="Plugins"
    />
  );
}
