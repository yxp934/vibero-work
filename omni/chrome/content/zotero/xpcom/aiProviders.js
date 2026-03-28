(function () {
  const root = typeof Zotero !== 'undefined' ? Zotero : this;
  const LEGACY_PREF = 'aiChat.customModelConfig';
  const PROVIDERS_PREF = 'aiChat.providersConfig';

  function _normalizeProvider(rawProvider, fallbackName = '') {
    if (!rawProvider || typeof rawProvider !== 'object') {
      return null;
    }

    const provider = {
      name: String(rawProvider.name || fallbackName || '').trim(),
      baseUrl: String(rawProvider.baseUrl || '').trim(),
      apiKey: String(rawProvider.apiKey || '').trim(),
      modelName: String(rawProvider.modelName || rawProvider.model || '').trim()
    };

    if (!provider.name || !provider.baseUrl || !provider.apiKey || !provider.modelName) {
      return null;
    }

    return provider;
  }

  function _readJSONPref(prefName) {
    try {
      if (!root || !root.Prefs) {
        return null;
      }
      const rawValue = root.Prefs.get(prefName, true);
      if (!rawValue) {
        return null;
      }
      return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
    } catch (e) {
      return null;
    }
  }

  function _writeProvidersConfig(config) {
    root.Prefs.set(PROVIDERS_PREF, JSON.stringify(config), true);
  }

  function _migrateLegacyConfigIfNeeded() {
    const existingConfig = _readJSONPref(PROVIDERS_PREF);
    if (existingConfig && Array.isArray(existingConfig.providers)) {
      return existingConfig;
    }

    const legacyConfig = _readJSONPref(LEGACY_PREF);
    const migratedProvider = _normalizeProvider(legacyConfig, 'Custom Provider');
    if (!migratedProvider) {
      return existingConfig || null;
    }

    const migratedConfig = {
      providers: [migratedProvider],
      defaultProviderName: migratedProvider.name
    };
    _writeProvidersConfig(migratedConfig);
    return migratedConfig;
  }

  function _readProvidersConfig() {
    const rawConfig = _migrateLegacyConfigIfNeeded() || _readJSONPref(PROVIDERS_PREF);
    const rawProviders = Array.isArray(rawConfig?.providers) ? rawConfig.providers : [];
    const providers = [];
    const seenNames = new Set();

    for (let i = 0; i < rawProviders.length; i++) {
      const normalized = _normalizeProvider(rawProviders[i], `Provider ${i + 1}`);
      if (!normalized || seenNames.has(normalized.name)) {
        continue;
      }
      providers.push(normalized);
      seenNames.add(normalized.name);
    }

    const defaultProviderName = String(rawConfig?.defaultProviderName || '').trim();
    const normalizedConfig = {
      providers,
      defaultProviderName
    };

    return normalizedConfig;
  }

  root.AIProviders = {
    getProviders() {
      return _readProvidersConfig().providers;
    },

    saveProviders(providers, defaultProviderName = '') {
      const normalizedProviders = Array.isArray(providers) ?
      providers.map((provider, index) => _normalizeProvider(provider, `Provider ${index + 1}`)).filter(Boolean) :
      [];

      let normalizedDefaultName = String(defaultProviderName || '').trim();
      if (!normalizedProviders.find((provider) => provider.name === normalizedDefaultName)) {
        normalizedDefaultName = normalizedProviders[0]?.name || '';
      }

      const config = {
        providers: normalizedProviders,
        defaultProviderName: normalizedDefaultName
      };

      _writeProvidersConfig(config);
      return config;
    },

    getDefaultProvider() {
      const { providers, defaultProviderName } = _readProvidersConfig();
      if (!providers.length) {
        return null;
      }
      const defaultProvider = providers.find((provider) => provider.name === defaultProviderName);
      return defaultProvider || providers[0];
    },

    setDefaultProvider(providerName) {
      const { providers } = _readProvidersConfig();
      const normalizedName = String(providerName || '').trim();
      const exists = providers.find((provider) => provider.name === normalizedName);
      if (!exists) {
        return false;
      }
      _writeProvidersConfig({
        providers,
        defaultProviderName: normalizedName
      });
      return true;
    },

    getProviderByName(providerName) {
      const normalizedName = String(providerName || '').trim();
      return _readProvidersConfig().providers.find((provider) => provider.name === normalizedName) || null;
    }
  };
})();
