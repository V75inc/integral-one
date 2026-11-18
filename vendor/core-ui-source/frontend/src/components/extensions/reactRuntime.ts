import React from 'react';
export default React;
export const {Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense,
  cloneElement, createContext, createElement, createFactory, createRef, forwardRef,
  isValidElement, lazy, memo, startTransition, useCallback, useContext, useDebugValue,
  useDeferredValue, useEffect, useId, useImperativeHandle, useInsertionEffect,
  useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore,
  useTransition, version} = React;
// Preserve require('react') semantics for bundled CommonJS dependencies.
// Rolldown's ESM external facade reads this standard namespace marker.
export {React as 'module.exports'};
