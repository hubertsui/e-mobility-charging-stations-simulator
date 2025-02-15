import type { ChargingStation } from './ChargingStation';
import type { ConfigurationKey, ConfigurationKeyType } from '../types';
import { logger } from '../utils';

interface ConfigurationKeyOptions {
  readonly?: boolean;
  visible?: boolean;
  reboot?: boolean;
}
interface DeleteConfigurationKeyParams {
  save?: boolean;
  caseInsensitive?: boolean;
}
interface AddConfigurationKeyParams {
  overwrite?: boolean;
  save?: boolean;
}

export const getConfigurationKey = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  caseInsensitive = false,
): ConfigurationKey | undefined => {
  return chargingStation.ocppConfiguration?.configurationKey?.find((configElement) => {
    if (caseInsensitive) {
      return configElement.key.toLowerCase() === key.toLowerCase();
    }
    return configElement.key === key;
  });
};

export const addConfigurationKey = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  value: string,
  options?: ConfigurationKeyOptions,
  params?: AddConfigurationKeyParams,
): void => {
  options = {
    ...{
      readonly: false,
      visible: true,
      reboot: false,
    },
    ...options,
  };
  params = { ...{ overwrite: false, save: false }, ...params };
  let keyFound = getConfigurationKey(chargingStation, key);
  if (keyFound && params?.overwrite) {
    deleteConfigurationKey(chargingStation, keyFound.key, {
      save: false,
    });
    keyFound = undefined;
  }
  if (!keyFound) {
    chargingStation.ocppConfiguration?.configurationKey?.push({
      key,
      readonly: options.readonly!,
      value,
      visible: options.visible,
      reboot: options.reboot,
    });
    params?.save && chargingStation.saveOcppConfiguration();
  } else {
    logger.error(
      `${chargingStation.logPrefix()} Trying to add an already existing configuration key: %j`,
      keyFound,
    );
  }
};

export const setConfigurationKeyValue = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  value: string,
  caseInsensitive = false,
): void => {
  const keyFound = getConfigurationKey(chargingStation, key, caseInsensitive);
  if (keyFound) {
    chargingStation.ocppConfiguration!.configurationKey![
      chargingStation.ocppConfiguration!.configurationKey!.indexOf(keyFound)
    ].value = value;
    chargingStation.saveOcppConfiguration();
  } else {
    logger.error(
      `${chargingStation.logPrefix()} Trying to set a value on a non existing configuration key: %j`,
      { key, value },
    );
  }
};

export const deleteConfigurationKey = (
  chargingStation: ChargingStation,
  key: ConfigurationKeyType,
  params?: DeleteConfigurationKeyParams,
): ConfigurationKey[] | undefined => {
  params = { ...{ save: true, caseInsensitive: false }, ...params };
  const keyFound = getConfigurationKey(chargingStation, key, params?.caseInsensitive);
  if (keyFound) {
    const deletedConfigurationKey = chargingStation.ocppConfiguration?.configurationKey?.splice(
      chargingStation.ocppConfiguration.configurationKey.indexOf(keyFound),
      1,
    );
    params?.save && chargingStation.saveOcppConfiguration();
    return deletedConfigurationKey;
  }
};
