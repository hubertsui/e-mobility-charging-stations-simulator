import { type ConnectorStatusTransition, OCPP20ConnectorStatusEnumType } from '../../../types';
import { OCPPConstants } from '../OCPPConstants';

export class OCPP20Constants extends OCPPConstants {
  static readonly ChargingStationStatusTransitions: Readonly<ConnectorStatusTransition[]> =
    Object.freeze([
      { to: OCPP20ConnectorStatusEnumType.Available },
      // { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Available },
      {
        from: OCPP20ConnectorStatusEnumType.Available,
        to: OCPP20ConnectorStatusEnumType.Unavailable,
      },
      { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Faulted },
      { to: OCPP20ConnectorStatusEnumType.Unavailable },
      {
        from: OCPP20ConnectorStatusEnumType.Unavailable,
        to: OCPP20ConnectorStatusEnumType.Available,
      },
      // {
      //   from: OCPP20ConnectorStatusEnumType.Unavailable,
      //   to: OCPP20ConnectorStatusEnumType.Unavailable,
      // },
      {
        from: OCPP20ConnectorStatusEnumType.Unavailable,
        to: OCPP20ConnectorStatusEnumType.Faulted,
      },
      { to: OCPP20ConnectorStatusEnumType.Faulted },
      { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Available },
      {
        from: OCPP20ConnectorStatusEnumType.Faulted,
        to: OCPP20ConnectorStatusEnumType.Unavailable,
      },
      // { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Faulted },
    ]);

  static readonly ConnectorStatusTransitions: Readonly<ConnectorStatusTransition[]> = Object.freeze(
    [
      { to: OCPP20ConnectorStatusEnumType.Available },
      // { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Available },
      { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Occupied },
      { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Reserved },
      {
        from: OCPP20ConnectorStatusEnumType.Available,
        to: OCPP20ConnectorStatusEnumType.Unavailable,
      },
      { from: OCPP20ConnectorStatusEnumType.Available, to: OCPP20ConnectorStatusEnumType.Faulted },
      // { to: OCPP20ConnectorStatusEnumType.Occupied },
      { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Available },
      // { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Occupied },
      // { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Reserved },
      {
        from: OCPP20ConnectorStatusEnumType.Occupied,
        to: OCPP20ConnectorStatusEnumType.Unavailable,
      },
      { from: OCPP20ConnectorStatusEnumType.Occupied, to: OCPP20ConnectorStatusEnumType.Faulted },
      // { to: OCPP20ConnectorStatusEnumType.Reserved },
      { from: OCPP20ConnectorStatusEnumType.Reserved, to: OCPP20ConnectorStatusEnumType.Available },
      { from: OCPP20ConnectorStatusEnumType.Reserved, to: OCPP20ConnectorStatusEnumType.Occupied },
      // { from: OCPP20ConnectorStatusEnumType.Reserved, to: OCPP20ConnectorStatusEnumType.Reserved },
      {
        from: OCPP20ConnectorStatusEnumType.Reserved,
        to: OCPP20ConnectorStatusEnumType.Unavailable,
      },
      { from: OCPP20ConnectorStatusEnumType.Reserved, to: OCPP20ConnectorStatusEnumType.Faulted },
      { to: OCPP20ConnectorStatusEnumType.Unavailable },
      {
        from: OCPP20ConnectorStatusEnumType.Unavailable,
        to: OCPP20ConnectorStatusEnumType.Available,
      },
      {
        from: OCPP20ConnectorStatusEnumType.Unavailable,
        to: OCPP20ConnectorStatusEnumType.Occupied,
      },
      // { from: OCPP20ConnectorStatusEnumType.Unavailable, to: OCPP20ConnectorStatusEnumType.Reserved },
      // { from: OCPP20ConnectorStatusEnumType.Unavailable, to: OCPP20ConnectorStatusEnumType.Unavailable },
      {
        from: OCPP20ConnectorStatusEnumType.Unavailable,
        to: OCPP20ConnectorStatusEnumType.Faulted,
      },
      { to: OCPP20ConnectorStatusEnumType.Faulted },
      { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Available },
      { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Occupied },
      { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Reserved },
      {
        from: OCPP20ConnectorStatusEnumType.Faulted,
        to: OCPP20ConnectorStatusEnumType.Unavailable,
      },
      // { from: OCPP20ConnectorStatusEnumType.Faulted, to: OCPP20ConnectorStatusEnumType.Faulted },
    ]
  );
}
