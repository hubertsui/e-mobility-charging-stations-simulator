import { BaseError, type OCPPError } from '../../../exception';
import {
  BroadcastChannelProcedureName,
  type BroadcastChannelRequestPayload,
  ProcedureName,
  type ProtocolRequest,
  type ProtocolRequestHandler,
  type ProtocolResponse,
  type ProtocolVersion,
  type RequestPayload,
  type ResponsePayload,
  ResponseStatus,
} from '../../../types';
import { isNotEmptyArray, isNullOrUndefined, logger } from '../../../utils';
import { Bootstrap } from '../../Bootstrap';
import { UIServiceWorkerBroadcastChannel } from '../../broadcast-channel/UIServiceWorkerBroadcastChannel';
import type { AbstractUIServer } from '../AbstractUIServer';

const moduleName = 'AbstractUIService';

export abstract class AbstractUIService {
  protected static readonly ProcedureNameToBroadCastChannelProcedureNameMapping = new Map<
    ProcedureName,
    BroadcastChannelProcedureName
  >([
    [ProcedureName.START_CHARGING_STATION, BroadcastChannelProcedureName.START_CHARGING_STATION],
    [ProcedureName.STOP_CHARGING_STATION, BroadcastChannelProcedureName.STOP_CHARGING_STATION],
    [ProcedureName.CLOSE_CONNECTION, BroadcastChannelProcedureName.CLOSE_CONNECTION],
    [ProcedureName.OPEN_CONNECTION, BroadcastChannelProcedureName.OPEN_CONNECTION],
    [
      ProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
      BroadcastChannelProcedureName.START_AUTOMATIC_TRANSACTION_GENERATOR,
    ],
    [
      ProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
      BroadcastChannelProcedureName.STOP_AUTOMATIC_TRANSACTION_GENERATOR,
    ],
    [ProcedureName.SET_SUPERVISION_URL, BroadcastChannelProcedureName.SET_SUPERVISION_URL],
    [ProcedureName.START_TRANSACTION, BroadcastChannelProcedureName.START_TRANSACTION],
    [ProcedureName.STOP_TRANSACTION, BroadcastChannelProcedureName.STOP_TRANSACTION],
    [ProcedureName.UPDATE_STATUS, BroadcastChannelProcedureName.UPDATE_STATUS],
    [ProcedureName.UPDATE_FIRMWARE_STATUS, BroadcastChannelProcedureName.UPDATE_FIRMWARE_STATUS],
    [ProcedureName.AUTHORIZE, BroadcastChannelProcedureName.AUTHORIZE],
    [ProcedureName.BOOT_NOTIFICATION, BroadcastChannelProcedureName.BOOT_NOTIFICATION],
    [ProcedureName.STATUS_NOTIFICATION, BroadcastChannelProcedureName.STATUS_NOTIFICATION],
    [ProcedureName.HEARTBEAT, BroadcastChannelProcedureName.HEARTBEAT],
    [ProcedureName.METER_VALUES, BroadcastChannelProcedureName.METER_VALUES],
    [ProcedureName.DATA_TRANSFER, BroadcastChannelProcedureName.DATA_TRANSFER],
    [
      ProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION,
      BroadcastChannelProcedureName.DIAGNOSTICS_STATUS_NOTIFICATION,
    ],
    [
      ProcedureName.FIRMWARE_STATUS_NOTIFICATION,
      BroadcastChannelProcedureName.FIRMWARE_STATUS_NOTIFICATION,
    ],
  ]);

  protected readonly requestHandlers: Map<ProcedureName, ProtocolRequestHandler>;
  private readonly version: ProtocolVersion;
  private readonly uiServer: AbstractUIServer;
  private readonly uiServiceWorkerBroadcastChannel: UIServiceWorkerBroadcastChannel;
  private readonly broadcastChannelRequests: Map<string, number>;

  constructor(uiServer: AbstractUIServer, version: ProtocolVersion) {
    this.uiServer = uiServer;
    this.version = version;
    this.requestHandlers = new Map<ProcedureName, ProtocolRequestHandler>([
      [ProcedureName.LIST_CHARGING_STATIONS, this.handleListChargingStations.bind(this)],
      [ProcedureName.START_SIMULATOR, this.handleStartSimulator.bind(this)],
      [ProcedureName.STOP_SIMULATOR, this.handleStopSimulator.bind(this)],
    ]);
    this.uiServiceWorkerBroadcastChannel = new UIServiceWorkerBroadcastChannel(this);
    this.broadcastChannelRequests = new Map<string, number>();
  }

  public async requestHandler(request: ProtocolRequest): Promise<ProtocolResponse | undefined> {
    let messageId: string | undefined;
    let command: ProcedureName | undefined;
    let requestPayload: RequestPayload | undefined;
    let responsePayload: ResponsePayload | undefined;
    try {
      [messageId, command, requestPayload] = request;

      if (this.requestHandlers.has(command) === false) {
        throw new BaseError(
          `${command} is not implemented to handle message payload ${JSON.stringify(
            requestPayload,
            null,
            2,
          )}`,
        );
      }

      // Call the request handler to build the response payload
      responsePayload = await this.requestHandlers.get(command)!(
        messageId,
        command,
        requestPayload,
      );
    } catch (error) {
      // Log
      logger.error(`${this.logPrefix(moduleName, 'requestHandler')} Handle request error:`, error);
      responsePayload = {
        hashIds: requestPayload?.hashIds,
        status: ResponseStatus.FAILURE,
        command,
        requestPayload,
        responsePayload,
        errorMessage: (error as Error).message,
        errorStack: (error as Error).stack,
        errorDetails: (error as OCPPError).details,
      };
    }
    if (!isNullOrUndefined(responsePayload)) {
      return this.uiServer.buildProtocolResponse(messageId!, responsePayload!);
    }
  }

  // public sendRequest(
  //   messageId: string,
  //   procedureName: ProcedureName,
  //   requestPayload: RequestPayload,
  // ): void {
  //   this.uiServer.sendRequest(
  //     this.uiServer.buildProtocolRequest(messageId, procedureName, requestPayload),
  //   );
  // }

  public sendResponse(messageId: string, responsePayload: ResponsePayload): void {
    if (this.uiServer.hasResponseHandler(messageId)) {
      this.uiServer.sendResponse(this.uiServer.buildProtocolResponse(messageId, responsePayload));
    }
  }

  public logPrefix = (modName: string, methodName: string): string => {
    return this.uiServer.logPrefix(modName, methodName, this.version);
  };

  public deleteBroadcastChannelRequest(uuid: string): void {
    this.broadcastChannelRequests.delete(uuid);
  }

  public getBroadcastChannelExpectedResponses(uuid: string): number {
    return this.broadcastChannelRequests.get(uuid) ?? 0;
  }

  protected handleProtocolRequest(
    uuid: string,
    procedureName: ProcedureName,
    payload: RequestPayload,
  ): void {
    this.sendBroadcastChannelRequest(
      uuid,
      AbstractUIService.ProcedureNameToBroadCastChannelProcedureNameMapping.get(procedureName)!,
      payload,
    );
  }

  private sendBroadcastChannelRequest(
    uuid: string,
    procedureName: BroadcastChannelProcedureName,
    payload: BroadcastChannelRequestPayload,
  ): void {
    if (isNotEmptyArray(payload.hashIds)) {
      payload.hashIds = payload.hashIds
        ?.filter((hashId) => !isNullOrUndefined(hashId))
        ?.map((hashId) => {
          if (this.uiServer.chargingStations.has(hashId) === true) {
            return hashId;
          }
          logger.warn(
            `${this.logPrefix(
              moduleName,
              'sendBroadcastChannelRequest',
            )} Charging station with hashId '${hashId}' not found`,
          );
        }) as string[];
    }
    const expectedNumberOfResponses = isNotEmptyArray(payload.hashIds)
      ? payload.hashIds!.length
      : this.uiServer.chargingStations.size;
    this.uiServiceWorkerBroadcastChannel.sendRequest([uuid, procedureName, payload]);
    this.broadcastChannelRequests.set(uuid, expectedNumberOfResponses);
  }

  private handleListChargingStations(): ResponsePayload {
    return {
      status: ResponseStatus.SUCCESS,
      chargingStations: [...this.uiServer.chargingStations.values()],
    } as ResponsePayload;
  }

  private async handleStartSimulator(): Promise<ResponsePayload> {
    try {
      await Bootstrap.getInstance().start();
      return { status: ResponseStatus.SUCCESS };
    } catch {
      return { status: ResponseStatus.FAILURE };
    }
  }

  private async handleStopSimulator(): Promise<ResponsePayload> {
    try {
      await Bootstrap.getInstance().stop();
      return { status: ResponseStatus.SUCCESS };
    } catch {
      return { status: ResponseStatus.FAILURE };
    }
  }
}
