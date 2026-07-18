const { withXcodeProject } = require('@expo/config-plugins');

const bundlePhaseName = '"Bundle React Native code and images"';
const unquotedScript =
  '`"$NODE_BINARY" --print "require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'"`';
const quotedScript =
  '"$("$NODE_BINARY" --print "require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'")"';

/**
 * React Native's default Xcode phase executes a command-substitution result
 * unquoted. Quote it so a repository path such as "Walking Tracker" works.
 */
module.exports = function withQuotedReactNativeBundleScript(config) {
  return withXcodeProject(config, (modConfig) => {
    const phases = modConfig.modResults.hash.project.objects.PBXShellScriptBuildPhase;
    const bundlePhase = Object.values(phases).find(
      (phase) => phase && phase.name === bundlePhaseName
    );

    if (!bundlePhase) {
      throw new Error(`Could not find the ${bundlePhaseName} Xcode build phase.`);
    }

    if (bundlePhase.shellScript.includes(unquotedScript)) {
      bundlePhase.shellScript = bundlePhase.shellScript.replace(unquotedScript, quotedScript);
    }

    return modConfig;
  });
};
