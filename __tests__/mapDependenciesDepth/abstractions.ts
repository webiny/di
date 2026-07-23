import { Abstraction } from "../../src/index.js";

export interface IDep1 {
  dep1(): void;
}
export interface IDep2 {
  dep2(): void;
}
export interface IDep3 {
  dep3(): void;
}
export interface IDep4 {
  dep4(): void;
}
export interface IDep5 {
  dep5(): void;
}
export interface IDep6 {
  dep6(): void;
}
export interface IDep7 {
  dep7(): void;
}
export interface IDep8 {
  dep8(): void;
}
export interface IDep9 {
  dep9(): void;
}
export interface IDep10 {
  dep10(): void;
}
export interface IDep11 {
  dep11(): void;
}
export interface IDep12 {
  dep12(): void;
}

export interface IService {
  run(): void;
}

export const Dep1 = new Abstraction<IDep1>("Dep1");
export const Dep2 = new Abstraction<IDep2>("Dep2");
export const Dep3 = new Abstraction<IDep3>("Dep3");
export const Dep4 = new Abstraction<IDep4>("Dep4");
export const Dep5 = new Abstraction<IDep5>("Dep5");
export const Dep6 = new Abstraction<IDep6>("Dep6");
export const Dep7 = new Abstraction<IDep7>("Dep7");
export const Dep8 = new Abstraction<IDep8>("Dep8");
export const Dep9 = new Abstraction<IDep9>("Dep9");
export const Dep10 = new Abstraction<IDep10>("Dep10");
export const Dep11 = new Abstraction<IDep11>("Dep11");
export const Dep12 = new Abstraction<IDep12>("Dep12");

export const ServiceAbstraction = new Abstraction<IService>("Service");
