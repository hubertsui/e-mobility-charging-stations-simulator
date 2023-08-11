import * as fs from 'node:fs';
import { type IncomingMessage, Server, type ServerResponse } from 'node:http';
import { type Http2Server, createServer } from 'node:http2';

import type { WebSocket } from 'ws';

import type { AbstractUIService } from './ui-services/AbstractUIService';
import { UIServiceFactory } from './ui-services/UIServiceFactory';
import { BaseError } from '../../exception';
import {
  ApplicationProtocolVersion,
  AuthenticationType,
  type ChargingStationData,
  type ProcedureName,
  type ProtocolRequest,
  type ProtocolResponse,
  ProtocolVersion,
  type RequestPayload,
  type ResponsePayload,
  type UIServerConfiguration,
} from '../../types';

export abstract class AbstractUIServer {
  public readonly chargingStations: Map<string, ChargingStationData>;
  protected readonly httpServer: Server | Http2Server;
  protected readonly responseHandlers: Map<string, ServerResponse | WebSocket>;
  protected readonly uiServices: Map<ProtocolVersion, AbstractUIService>;

  public constructor(protected readonly uiServerConfiguration: UIServerConfiguration) {
    this.chargingStations = new Map<string, ChargingStationData>();
    switch (this.uiServerConfiguration.version) {
      case ApplicationProtocolVersion.VERSION_11:
        this.httpServer = new Server();
        break;
      case ApplicationProtocolVersion.VERSION_20:
        this.httpServer = createServer();
        break;
      default:
        throw new BaseError(
          `Unsupported application protocol version ${this.uiServerConfiguration.version}`,
        );
    }
    this.responseHandlers = new Map<string, ServerResponse | WebSocket>();
    this.uiServices = new Map<ProtocolVersion, AbstractUIService>();
  }

  public async readFile(filePath: string): Promise<string | Buffer> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'binary', (err, data: string | Buffer) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data);
      });
    });
  }

  public buildProtocolRequest(
    id: string,
    procedureName: ProcedureName,
    requestPayload: RequestPayload,
  ): ProtocolRequest {
    return [id, procedureName, requestPayload];
  }

  public buildProtocolResponse(id: string, responsePayload: ResponsePayload): ProtocolResponse {
    return [id, responsePayload];
  }

  public stop(): void {
    this.chargingStations.clear();
  }

  public async sendInternalRequest(request: ProtocolRequest): Promise<ProtocolResponse> {
    const protocolVersion = ProtocolVersion['0.0.1'];
    this.registerProtocolVersionUIService(protocolVersion);
    return this.uiServices
      .get(protocolVersion)
      ?.requestHandler(request) as Promise<ProtocolResponse>;
  }

  public hasResponseHandler(id: string): boolean {
    return this.responseHandlers.has(id);
  }

  protected startHttpServer(): void {
    if (this.httpServer.listening === false) {
      this.httpServer.on('request', (req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/') {
          console.log('首页跳转');
          res.writeHead(301, { Location: '/index.html' });
          res.end();
          return;
        }
        if (req.url?.length) {
          const url: string = req.url;
          if (url.indexOf('/') !== -1) {
            console.log('获取静态文件', url, process.cwd());
            const serveFile = (data: string | Buffer) => {
              if (url.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript');
              }
              res.write(data, 'binary');
              res.end();
            };
            this.readFile('./dist' + url)
              .then(serveFile)
              .catch(() => {
                this.readFile('./dist/dist' + url)
                  .then(serveFile)
                  .catch(() => {
                    res.statusCode = 404;
                    res.end();
                  });
              });
            return;
          }
        }
        console.log('404');
        res.statusCode = 404;
        res.end();
      });
      this.httpServer.listen(this.uiServerConfiguration.options);
    }
  }

  protected registerProtocolVersionUIService(version: ProtocolVersion): void {
    if (this.uiServices.has(version) === false) {
      this.uiServices.set(version, UIServiceFactory.getUIServiceImplementation(version, this));
    }
  }

  protected authenticate(req: IncomingMessage, next: (err?: Error) => void): void {
    if (this.isBasicAuthEnabled() === true) {
      if (this.isValidBasicAuth(req) === false) {
        next(new BaseError('Unauthorized'));
      }
      next();
    }
    next();
  }

  private isBasicAuthEnabled(): boolean {
    return (
      this.uiServerConfiguration.authentication?.enabled === true &&
      this.uiServerConfiguration.authentication?.type === AuthenticationType.BASIC_AUTH
    );
  }

  private isValidBasicAuth(req: IncomingMessage): boolean {
    const authorizationHeader = req.headers.authorization ?? '';
    const authorizationToken = authorizationHeader.split(/\s+/).pop() ?? '';
    const authentication = Buffer.from(authorizationToken, 'base64').toString();
    const authenticationParts = authentication.split(/:/);
    const username = authenticationParts.shift();
    const password = authenticationParts.join(':');
    return (
      this.uiServerConfiguration.authentication?.username === username &&
      this.uiServerConfiguration.authentication?.password === password
    );
  }

  public abstract start(): void;
  public abstract sendRequest(request: ProtocolRequest): void;
  public abstract sendResponse(response: ProtocolResponse): void;
  public abstract logPrefix(
    moduleName?: string,
    methodName?: string,
    prefixSuffix?: string,
  ): string;
}
