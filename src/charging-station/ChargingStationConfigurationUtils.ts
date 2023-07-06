import type { ChargingStation } from './ChargingStation';
import type { ConfigurationKey, ConfigurationKeyType } from '../types';
import { logger } from '../utils';

type ConfigurationKeyOptions = { readonly?: boolean; visible?: boolean; reboot?: boolean };
type DeleteConfigurationKeyParams = { save?: boolean; caseInsensitive?: boolean };
type AddConfigurationKeyParams = { overwrite?: boolean; save?: boolean };

export class ChargingStationConfigurationUtils {
  private constructor() {
    // This is intentional
  }

  public static getConfigurationKey(
    chargingStation: ChargingStation,
    key: ConfigurationKeyType,
    caseInsensitive = false
  ): ConfigurationKey | undefined {
    return chargingStation.ocppConfiguration?.configurationKey?.find((configElement) => {
      if (caseInsensitive) {
        return configElement.key.toLowerCase() === key.toLowerCase();
      }
      return configElement.key === key;
    });
  }

  public static addConfigurationKey(
    chargingStation: ChargingStation,
    key: ConfigurationKeyType,
    value: string,
    options: ConfigurationKeyOptions = {
      readonly: false,
      visible: true,
      reboot: false,
    },
    params: AddConfigurationKeyParams = { overwrite: false, save: false }
  ): void {
    options = {
      ...{
        readonly: false,
        visible: true,
        reboot: false,
      },
      ...options,
    };
    params = { ...{ overwrite: false, save: false }, ...params };
    let keyFound = ChargingStationConfigurationUtils.getConfigurationKey(chargingStation, key);
    if (keyFound && params?.overwrite) {
      ChargingStationConfigurationUtils.deleteConfigurationKey(chargingStation, keyFound.key, {
        save: false,
      });
      keyFound = undefined;
    }
    if (!keyFound) {
      chargingStation.ocppConfiguration?.configurationKey?.push({
        key,
        readonly: options.readonly,
        value,
        visible: options.visible,
        reboot: options.reboot,
      });
      params?.save && chargingStation.saveOcppConfiguration();
    } else {
      logger.error(
        `${chargingStation.logPrefix()} Trying to add an already existing configuration key: %j`,
        keyFound
      );
    }
  }

  public static setConfigurationKeyValue(
    chargingStation: ChargingStation,
    key: ConfigurationKeyType,
    value: string,
    caseInsensitive = false
  ): void {
    const keyFound = ChargingStationConfigurationUtils.getConfigurationKey(
      chargingStation,
      key,
      caseInsensitive
    );
    if (keyFound) {
      chargingStation.ocppConfiguration.configurationKey[
        chargingStation.ocppConfiguration.configurationKey.indexOf(keyFound)
      ].value = value;
      chargingStation.saveOcppConfiguration();
    } else {
      logger.error(
        `${chargingStation.logPrefix()} Trying to set a value on a non existing configuration key: %j`,
        { key, value }
      );
    }
  }

  public static deleteConfigurationKey(
    chargingStation: ChargingStation,
    key: ConfigurationKeyType,
    params: DeleteConfigurationKeyParams = { save: true, caseInsensitive: false }
  ): ConfigurationKey[] | undefined {
    params = { ...{ save: true, caseInsensitive: false }, ...params };
    const keyFound = ChargingStationConfigurationUtils.getConfigurationKey(
      chargingStation,
      key,
      params?.caseInsensitive
    );
    if (keyFound) {
      const deletedConfigurationKey = chargingStation.ocppConfiguration?.configurationKey?.splice(
        chargingStation.ocppConfiguration.configurationKey.indexOf(keyFound),
        1
      );
      params?.save && chargingStation.saveOcppConfiguration();
      return deletedConfigurationKey;
    }
  }
}
