import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';

import { StatusCodes } from 'http-status-codes';

import { AbstractUIServer } from './AbstractUIServer';
import { UIServerUtils } from './UIServerUtils';
import { BaseError } from '../../exception';
import {
  type ProcedureName,
  type Protocol,
  type ProtocolRequest,
  type ProtocolResponse,
  type ProtocolVersion,
  type RequestPayload,
  ResponseStatus,
  type UIServerConfiguration,
} from '../../types';
import { Constants, Utils, logger } from '../../utils';

const moduleName = 'UIHttpServer';

enum HttpMethods {
  GET = 'GET',
  PUT = 'PUT',
  POST = 'POST',
  PATCH = 'PATCH',
}

export class UIHttpServer extends AbstractUIServer {
  public constructor(protected readonly uiServerConfiguration: UIServerConfiguration) {
    super(uiServerConfiguration);
  }

  public start(): void {
    this.httpServer.on('request', this.requestListener.bind(this) as RequestListener);
    this.startHttpServer();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public sendRequest(request: ProtocolRequest): void {
    // This is intentionally left blank
  }

  public sendResponse(response: ProtocolResponse): void {
    const [uuid, payload] = response;
    try {
      if (this.hasResponseHandler(uuid) === true) {
        const res = this.responseHandlers.get(uuid) as ServerResponse;
        res
          .writeHead(this.responseStatusToStatusCode(payload.status), {
            'Content-Type': 'application/json',
          })
          .end(JSON.stringify(payload));
      } else {
        logger.error(
          `${this.logPrefix(moduleName, 'sendResponse')} Response for unknown request id: ${uuid}`
        );
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix(moduleName, 'sendResponse')} Error at sending response id '${uuid}':`,
        error
      );
    } finally {
      this.responseHandlers.delete(uuid);
    }
  }

  public logPrefix = (modName?: string, methodName?: string, prefixSuffix?: string): string => {
    const logMsgPrefix = prefixSuffix ? `UI HTTP Server ${prefixSuffix}` : 'UI HTTP Server';
    const logMsg =
      Utils.isNotEmptyString(modName) && Utils.isNotEmptyString(methodName)
        ? ` ${logMsgPrefix} | ${modName}.${methodName}:`
        : ` ${logMsgPrefix} |`;
    return Utils.logPrefix(logMsg);
  };

  private requestListener(req: IncomingMessage, res: ServerResponse): void {
    this.authenticate(req, (err) => {
      if (err) {
        res
          .writeHead(StatusCodes.UNAUTHORIZED, {
            'Content-Type': 'text/plain',
            'WWW-Authenticate': 'Basic realm=users',
          })
          .end(`${StatusCodes.UNAUTHORIZED} Unauthorized`)
          .destroy();
        req.destroy();
      }
    });
    // Expected request URL pathname: /ui/:version/:procedureName
    const [protocol, version, procedureName] = req.url?.split('/').slice(1) as [
      Protocol,
      ProtocolVersion,
      ProcedureName
    ];
    const uuid = Utils.generateUUID();
    this.responseHandlers.set(uuid, res);
    try {
      const fullProtocol = `${protocol}${version}`;
      if (UIServerUtils.isProtocolAndVersionSupported(fullProtocol) === false) {
        throw new BaseError(`Unsupported UI protocol version: '${fullProtocol}'`);
      }
      this.registerProtocolVersionUIService(version);
      req.on('error', (error) => {
        logger.error(
          `${this.logPrefix(moduleName, 'requestListener.req.onerror')} Error on HTTP request:`,
          error
        );
      });
      if (req.method === HttpMethods.POST) {
        const bodyBuffer = [];
        req
          .on('data', (chunk) => {
            bodyBuffer.push(chunk);
          })
          .on('end', () => {
            const body = JSON.parse(Buffer.concat(bodyBuffer).toString()) as RequestPayload;
            this.uiServices
              .get(version)
              ?.requestHandler(
                this.buildProtocolRequest(
                  uuid,
                  procedureName,
                  body ?? Constants.EMPTY_FREEZED_OBJECT
                )
              )
              .then((protocolResponse: ProtocolResponse) => {
                if (!Utils.isNullOrUndefined(protocolResponse)) {
                  this.sendResponse(protocolResponse);
                }
              })
              .catch(Constants.EMPTY_FUNCTION);
          });
      } else {
        throw new BaseError(`Unsupported HTTP method: '${req.method}'`);
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix(moduleName, 'requestListener')} Handle HTTP request error:`,
        error
      );
      this.sendResponse(this.buildProtocolResponse(uuid, { status: ResponseStatus.FAILURE }));
    }
  }

  private responseStatusToStatusCode(status: ResponseStatus): StatusCodes {
    switch (status) {
      case ResponseStatus.SUCCESS:
        return StatusCodes.OK;
      case ResponseStatus.FAILURE:
        return StatusCodes.BAD_REQUEST;
      default:
        return StatusCodes.INTERNAL_SERVER_ERROR;
    }
  }
}
