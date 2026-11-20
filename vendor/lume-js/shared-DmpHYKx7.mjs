function logWarn(msg, ...rest) {
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(msg, ...rest);
  }
}
function logError(msg, ...rest) {
  if (typeof console !== "undefined" && typeof console.error === "function") {
    console.error(msg, ...rest);
  }
}
export {
  logWarn as a,
  logError as l
};
