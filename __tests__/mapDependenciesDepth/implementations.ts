import type {
  IDep1,
  IDep2,
  IDep3,
  IDep4,
  IDep5,
  IDep6,
  IDep7,
  IDep8,
  IDep9,
  IDep10,
  IDep11,
  IDep12,
  IService
} from "./abstractions.js";

export class EightDepsService implements IService {
  constructor(
    private d1: IDep1,
    private d2: IDep2,
    private d3: IDep3,
    private d4: IDep4,
    private d5: IDep5,
    private d6: IDep6,
    private d7: IDep7,
    private d8: IDep8
  ) {}
  run() {}
}

export class NineDepsService implements IService {
  constructor(
    private d1: IDep1,
    private d2: IDep2,
    private d3: IDep3,
    private d4: IDep4,
    private d5: IDep5,
    private d6: IDep6,
    private d7: IDep7,
    private d8: IDep8,
    private d9: IDep9
  ) {}
  run() {}
}

export class TwelveDepsService implements IService {
  constructor(
    private d1: IDep1,
    private d2: IDep2,
    private d3: IDep3,
    private d4: IDep4,
    private d5: IDep5,
    private d6: IDep6,
    private d7: IDep7,
    private d8: IDep8,
    private d9: IDep9,
    private d10: IDep10,
    private d11: IDep11,
    private d12: IDep12
  ) {}
  run() {}
}
