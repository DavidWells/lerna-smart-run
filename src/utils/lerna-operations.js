const getFilteredPackages = require("@lerna/filter-options/lib/get-filtered-packages");
const Project = require("@lerna/project");
const PackageGraph = require("@lerna/package-graph");
const defaultOptions = require("@lerna/command/lib/default-options");
const RunCommand = require("@lerna/run");
const multimatch = require("multimatch");
const os = require("os");

// copy pasted from lerna source code since not exported
function arrify(thing) {
  if (!thing) {
    return [];
  }

  if (!Array.isArray(thing)) {
    return [thing];
  }

  return thing;
}

const filterPackages = async (argv, sinceRef = null) => {
  const project = new Project();
  const packages = await project.getPackages();

  const packageGraph = new PackageGraph(packages);

  const execOpts = { cwd: "." };

  // We may revisit this and refactor smartRun to accept all of
  // lerna's filter yargs and only use their defaults.
  const defaultArgs = {
    all: true,
    includeDependents: !argv.excludeDependents,
    scope: argv.scope,
    ignore: argv.ignore,
  };

  const lsArgs = sinceRef
    ? {
        ...defaultArgs,
        since: sinceRef,
      }
    : defaultArgs;

  const options = defaultOptions(lsArgs, project.config);

  const filteredPackages = await getFilteredPackages(
    packageGraph,
    execOpts,
    options
  );

  const packageNames = filteredPackages.map((pkg) => pkg.name);

  // We lose order here since we go by package names, which aren't sorted the way we want
  const unorderedRunFirstPackages = multimatch(
    packageNames,
    arrify(argv.runFirst)
  );
  const unorderedRunLastPackages = multimatch(
    packageNames,
    arrify(argv.runLast)
  );

  // restore specified ordering from runFirst and runLast, and pass the args themselves forwards
  // should revisit with the above code. this is a bit wasteful
  const runFirstGlobs = arrify(argv.runFirst).reduce((filtered, pattern) => {
    const matchedPackages = multimatch(unorderedRunFirstPackages, [pattern]);
    if (matchedPackages.length > 0) {
      return [...filtered, pattern];
    }
    return filtered
  }, []);
  const runLastGlobs = arrify(argv.runLast).reduce((filtered, pattern) => {
    const matchedPackages = multimatch(unorderedRunLastPackages, [pattern]);
    if (matchedPackages.length > 0) {
      return [...filtered, pattern];
    }
    return filtered
  }, []);

  const otherPackages = packageNames.filter(
    (pkg) => !unorderedRunFirstPackages.includes(pkg) && !unorderedRunLastPackages.includes(pkg)
  );

  return { runFirstGlobs, otherPackages, runLastGlobs };
};

const runCommand = async (argv, lernaArgs, sinceRef = null) => {
  const {
    runFirstGlobs,
    otherPackages,
    runLastGlobs,
  } = await filterPackages(argv, sinceRef);

  const defaultArgs = {
    ...lernaArgs,
    concurrency: argv["concurrency"] || os.cpus().length,
    "--": argv["--"] || [],
  };

  const runFirstPackagesChanged = runFirstGlobs.length > 0;
  const packagesChanged = otherPackages.length > 0;
  const runLastPackagesChanged = runLastGlobs.length > 0;

  if (runFirstPackagesChanged) {
    for (const glob of runFirstGlobs) {
      const packageArgs = {
        ...defaultArgs,
        scope: glob,
      };
      await new RunCommand(packageArgs);
    }
  }

  if (packagesChanged) {
    const packageArgs = {
      ...defaultArgs,
      scope: otherPackages,
    };
    await new RunCommand(packageArgs);
  }

  if (runLastPackagesChanged) {
    for (const glob of runLastGlobs) {
      const packageArgs = {
        ...defaultArgs,
        scope: glob,
      };
      await new RunCommand(packageArgs);
    }
  }

  return packagesChanged;
};

exports.runCommand = runCommand;
