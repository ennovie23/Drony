// Windows installs Python as `python` (`python3` is often a Store stub);
// PYTHON_BIN in .env can point at a specific interpreter or venv.
export function resolvePythonBin(platform, env) {
  if (env.PYTHON_BIN) return env.PYTHON_BIN;
  return platform === 'win32' ? 'python' : 'python3';
}
