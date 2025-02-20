/* eslint-disable import/no-cycle */
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import detectPort from 'detect-port';
import ora from 'ora';
import ip from 'ip';
import axios from 'axios';
import colorString from 'color-string';

import { isRunningOnWindows, getRealPath } from './systemTools/fileutils';
import { createPlatformBuild, cleanPlatformBuild } from './platformTools';
import CLI from './cli';
import {
    logWelcome, configureLogger, logError, logTask,
    logWarning, logDebug, logInfo, logComplete, logSuccess, logEnd,
    logInitialize, logAppInfo
} from './systemTools/logger';
import {
    IOS, ANDROID, ANDROID_TV, ANDROID_WEAR, WEB, TIZEN, TIZEN_MOBILE, TVOS,
    WEBOS, MACOS, WINDOWS, TIZEN_WATCH, KAIOS, FIREFOX_OS, FIREFOX_TV,
    SDK_PLATFORMS,
    PLATFORMS,
    SUPPORTED_PLATFORMS
} from './constants';
import { execCLI } from './systemTools/exec';
import {
    parseRenativeConfigs, createRnvConfig, updateConfig,
    fixRenativeConfigsSync, configureRnvGlobal, checkIsRenativeProject
} from './configTools/configParser';
import { cleanPlaformAssets } from './projectTools/projectParser';
import { generateOptions, inquirerPrompt } from './systemTools/prompt';
import Config from './config';

export const initializeBuilder = (cmd, subCmd, process, program) => new Promise((resolve, reject) => {
    const c = createRnvConfig(program, process, cmd, subCmd);

    configureLogger(c, c.process, c.command, c.subCommand, program.info === true);
    logInitialize();

    resolve(c);
});

export const isPlatformSupportedSync = (platform, resolve, reject) => {
    if (!platform) {
        if (reject) {
            reject(
                chalk.red(
                    `You didn't specify platform. make sure you add "${chalk.white.bold(
                        '-p <PLATFORM>',
                    )}" option to your command!`,
                ),
            );
        }
        return false;
    }
    if (!SUPPORTED_PLATFORMS.includes(platform)) {
        if (reject) reject(chalk.red(`Platform ${platform} is not supported. Use one of the following: ${chalk.white(SUPPORTED_PLATFORMS.join(', '))} .`));
        return false;
    }
    if (resolve) resolve();
    return true;
};

export const getSourceExts = (c) => {
    const sExt = PLATFORMS[c.platform]?.sourceExts;
    if (sExt) {
        return [...sExt.factors, ...sExt.platforms, ...sExt.fallbacks];
    }
    return [];
};

export const getSourceExtsAsString = (c) => {
    const sourceExts = getSourceExts(c);
    return sourceExts.length ? `['${sourceExts.join('\',\'')}']` : '[]';
};

export const isPlatformSupported = async (c) => {
    logTask(`isPlatformSupported:${c.platform}`);
    let platformsAsObj = c.buildConfig ? c.buildConfig.platforms : c.supportedPlatforms;
    if (!platformsAsObj) platformsAsObj = SUPPORTED_PLATFORMS;
    const opts = generateOptions(platformsAsObj);

    if (!c.platform || c.platform === '?' || !SUPPORTED_PLATFORMS.includes(c.platform)) {
        const { platform } = await inquirerPrompt({
            name: 'platform',
            type: 'list',
            message: 'Pick one of available platforms',
            choices: opts.keysAsArray,
            logMessage: 'You need to specify platform'
        });

        c.platform = platform;
        c.program.platform = platform;
        return platform;
    }
};

export const sanitizeColor = (val) => {
    if (!val) {
        logWarning('sanitizeColor: passed null. will use default #FFFFFF instead');
        return {
            rgb: [255, 255, 255, 1],
            rgbDecimal: [1, 1, 1, 1],
            hex: '#FFFFFF'
        };
    }

    const rgb = colorString.get.rgb(val);
    const hex = colorString.to.hex(rgb);

    return {
        rgb,
        rgbDecimal: rgb.map(v => (v > 1 ? Math.round((v / 255) * 10) / 10 : v)),
        hex
    };
};

export const isBuildSchemeSupported = async (c) => {
    logTask(`isBuildSchemeSupported:${c.platform}`);

    const { scheme } = c.program;

    if (!c.buildConfig.platforms[c.platform]) {
        c.buildConfig.platforms[c.platform] = {};
    }

    const { buildSchemes } = c.buildConfig.platforms[c.platform];


    if (!buildSchemes) {
        logWarning(`Your appConfig for platform ${c.platform} has no buildSchemes. Will continue with defaults`);
        return;
    }

    const schemeDoesNotExist = scheme && !buildSchemes[scheme];
    if (scheme === '?' || schemeDoesNotExist) {
        if (schemeDoesNotExist && scheme && scheme !== '?') {
            logError('Build scheme you picked does not exists.');
        }
        const opts = generateOptions(buildSchemes);

        const { selectedScheme } = await inquirerPrompt({
            name: 'selectedScheme',
            type: 'list',
            message: 'Pick one of available buildSchemes',
            choices: opts.keysAsArray,
            logMessage: 'You need to specify scheme'
        });

        c.program.scheme = selectedScheme;
        return selectedScheme;
    }
    return scheme;
};

export const isSdkInstalled = (c, platform) => {
    logTask(`isSdkInstalled: ${platform}`);

    if (c.files.workspace.config) {
        const sdkPlatform = SDK_PLATFORMS[platform];
        if (sdkPlatform) return fs.existsSync(getRealPath(c, c.files.workspace.config.sdks[sdkPlatform]));
    }

    return false;
};

export const checkSdk = (c, platform, reject) => {
    if (!isSdkInstalled(c, platform)) {
        const err = `${platform} requires SDK to be installed. check your ${chalk.white(c.paths.workspace.config)} file if you SDK path is correct. current value is ${chalk.white(c.files.workspace.config?.sdks?.ANDROID_SDK)}`;
        if (reject) {
            reject(err);
        } else {
            throw new Error(err);
        }
        return false;
    }
    return true;
};

export const getAppFolder = (c, platform) => path.join(c.paths.project.builds.dir, `${c.runtime.appId}_${platform}`);

export const getBinaryPath = (c, platform) => {
    const appFolder = getAppFolder(c, platform);
    const id = getConfigProp(c, platform, 'id');
    const signingConfig = getConfigProp(c, platform, 'signingConfig', 'debug');
    const version = getAppVersion(c, platform);
    const productName = 'ReNative - macos';
    const appName = getConfigProp(c, platform, 'appName');

    switch (platform) {
    case IOS:
    case TVOS:
        return `${appFolder}/release/RNVApp.ipa`;
    case ANDROID:
    case ANDROID_TV:
    case ANDROID_WEAR:
        return `${appFolder}/app/build/outputs/apk/${signingConfig}/app-${signingConfig}.apk`;
    case WEB:
        return `${appFolder}/public`;
    case MACOS:
    case WINDOWS:
        return `${appFolder}/build/release/${productName}-${version}`;
    case TIZEN:
    case TIZEN_MOBILE:
        return `${appFolder}/output/${appName}.wgt`;
    case WEBOS:
        return `${appFolder}/output/${id}_${version}_all.ipk`;
    }

    return appFolder;
};

export const getAppSubFolder = (c, platform) => {
    let subFolder = '';
    if (platform === IOS) subFolder = 'RNVApp';
    else if (platform === TVOS) subFolder = 'RNVAppTVOS';
    return path.join(getAppFolder(c, platform), subFolder);
};

export const getAppTemplateFolder = (c, platform) => {
    console.log('getAppTemplateFolder', c.paths.project.platformTemplatesDirs[platform], platform);
    return path.join(c.paths.project.platformTemplatesDirs[platform], `${platform}`);
};

export const getAppConfigId = c => c.buildConfig.id;

const _getValueOrMergedObject = (resultCli, resultScheme, resultPlatforms, resultCommon) => {
    if (resultCli !== undefined) {
        return resultCli;
    }
    if (resultScheme !== undefined) {
        if (Array.isArray(resultScheme) || typeof resultScheme !== 'object') return resultScheme;
        const val = Object.assign(resultCommon || {}, resultPlatforms || {}, resultScheme);
        return val;
    }
    if (resultPlatforms !== undefined) {
        if (Array.isArray(resultPlatforms) || typeof resultPlatforms !== 'object') return resultPlatforms;
        return Object.assign(resultCommon || {}, resultPlatforms);
    }
    if (resultPlatforms === null) return null;
    return resultCommon;
};

export const CLI_PROPS = [
    'provisioningStyle',
    'codeSignIdentity',
    'provisionProfileSpecifier'
];

export const getConfigProp = (c, platform, key, defaultVal) => {
    if (!c.buildConfig) {
        logError('getConfigProp: c.buildConfig is undefined!');
        return null;
    }
    const p = c.buildConfig.platforms[platform];
    const ps = _getScheme(c);
    let resultPlatforms;
    let scheme;
    if (p) {
        scheme = p.buildSchemes ? p.buildSchemes[ps] : undefined;
        resultPlatforms = c.buildConfig.platforms[platform][key];
    }

    scheme = scheme || {};
    const resultCli = CLI_PROPS.includes(key) ? c.program[key] : undefined;
    const resultScheme = scheme[key];
    const resultCommon = c.buildConfig.common?.[key];

    let result = _getValueOrMergedObject(resultCli, resultScheme, resultPlatforms, resultCommon);

    if (result === undefined) result = defaultVal; // default the value only if it's not specified in any of the files. i.e. undefined
    logTask(`getConfigProp:${platform}:${key}:${result}`, chalk.grey);
    return result;
};

export const getAppId = (c, platform) => {
    const id = getConfigProp(c, platform, 'id');
    const idSuffix = getConfigProp(c, platform, 'idSuffix');
    return idSuffix ? `${id}${idSuffix}` : id;
};

export const getAppTitle = (c, platform) => getConfigProp(c, platform, 'title');

export const getAppVersion = (c, platform) => getConfigProp(c, platform, 'version') || c.files.project.package?.version;

export const getAppAuthor = (c, platform) => getConfigProp(c, platform, 'author') || c.files.project.package?.author;

export const getAppLicense = (c, platform) => getConfigProp(c, platform, 'license') || c.files.project.package?.license;

export const getEntryFile = (c, platform) => c.buildConfig.platforms?.[platform]?.entryFile;

export const getGetJsBundleFile = (c, platform) => getConfigProp(c, platform, 'getJsBundleFile');

export const getAppDescription = (c, platform) => getConfigProp(c, platform, 'description') || c.files.project.package?.description;

export const getAppVersionCode = (c, platform) => {
    const versionCode = getConfigProp(c, platform, 'versionCode');
    if (versionCode) return versionCode;

    const version = getAppVersion(c, platform);

    let vc = '';
    version
        .split('-')[0]
        .split('.')
        .forEach((v) => {
            vc += v.length > 1 ? v : `0${v}`;
        });
    return Number(vc).toString();
};

export const logErrorPlatform = (c, platform) => {
    logError(`Platform: ${chalk.white(platform)} doesn't support command: ${chalk.white(c.command)}`);
};

export const isPlatformActive = (c, platform, resolve) => {
    if (!c.buildConfig || !c.buildConfig.platforms) {
        logError(`Looks like your appConfigFile is not configured properly! check ${chalk.white(c.paths.appConfig.config)} location.`);
        if (resolve) resolve();
        return false;
    }
    if (!c.buildConfig.platforms[platform]) {
        console.log(`Platform ${platform} not configured for ${c.runtime.appId}. skipping.`);
        if (resolve) resolve();
        return false;
    }
    return true;
};

export const PLATFORM_RUNS = {};

export const configureIfRequired = (c, platform) => new Promise((resolve, reject) => {
    logTask(`configureIfRequired:${platform}`);

    if (PLATFORM_RUNS[platform]) {
        resolve();
        return;
    }
    PLATFORM_RUNS[platform] = true;
    const { device } = c.program;
    const nc = {
        command: 'configure',
        program: {
            appConfig: c.id,
            update: false,
            platform,
            device
        }
    };

    if (c.program.reset) {
        cleanPlatformBuild(c, platform)
            .then(() => cleanPlaformAssets(c))
            .then(() => createPlatformBuild(c, platform))
            .then(() => CLI(c, nc))
            .then(() => resolve(c))
            .catch(e => reject(e));
    } else {
        createPlatformBuild(c, platform)
            .then(() => CLI(c, nc))
            .then(() => resolve(c))
            .catch(e => reject(e));
    }
});

export const writeCleanFile = (source, destination, overrides) => {
    // logTask(`writeCleanFile`)
    if (!fs.existsSync(source)) {
        logError(`Cannot write file. source path doesn't exists: ${source}`);
        return;
    }
    if (!fs.existsSync(destination)) {
        logWarning(`destination path doesn't exists: ${destination}. will create new one`);
        // return;
    }
    const pFile = fs.readFileSync(source, 'utf8');
    let pFileClean = pFile;
    if (overrides) {
        overrides.forEach((v) => {
            const regEx = new RegExp(v.pattern, 'g');
            pFileClean = pFileClean.replace(regEx, v.override);
        });
    }

    fs.writeFileSync(destination, pFileClean, 'utf8');
};

const _getScheme = c => c.program.scheme || 'debug';

export const getBuildsFolder = (c, platform, customPath) => {
    const pp = customPath || c.paths.appConfig.dir;
    // if (!fs.existsSync(pp)) {
    //     logWarning(`Path ${chalk.white(pp)} does not exist! creating one for you..`);
    // }
    const p = path.join(pp, `builds/${platform}@${_getScheme(c)}`);
    if (fs.existsSync(p)) return p;
    return path.join(pp, `builds/${platform}`);
};

export const getIP = () => ip.address();

export const cleanPlatformIfRequired = (c, platform) => new Promise((resolve, reject) => {
    if (c.program.reset) {
        logInfo(`You passed ${chalk.white('-r')} argument. paltform ${chalk.white(platform)} will be cleaned up first!`);
        cleanPlatformBuild(c, platform)
            .then(() => resolve(c))
            .catch(e => reject(e));
    } else {
        resolve();
    }
});

export const checkPortInUse = (c, platform, port) => new Promise((resolve, reject) => {
    detectPort(port, (err, availablePort) => {
        if (err) {
            reject(err);
            return;
        }
        resolve(port !== availablePort);
    });
});

export const resolveNodeModulePath = (c, filePath) => {
    let pth = path.join(c.paths.rnv.nodeModulesDir, filePath);
    if (!fs.existsSync(pth)) {
        pth = path.join(c.paths.project.nodeModulesDir, filePath);
    }
    return pth;
};

export const getBuildFilePath = (c, platform, filePath) => {
    // P1 => platformTemplates
    let sp = path.join(getAppTemplateFolder(c, platform), filePath);
    // P2 => projectConfigs + @buildSchemes
    const sp2 = path.join(getBuildsFolder(c, platform, c.paths.project.projectConfig.dir), filePath);
    if (fs.existsSync(sp2)) sp = sp2;
    // P3 => appConfigs + @buildSchemes
    const sp3 = path.join(getBuildsFolder(c, platform), filePath);
    if (fs.existsSync(sp3)) sp = sp3;
    return sp;
};

export const waitForEmulator = async (c, cli, command, callback) => {
    let attempts = 0;
    const maxAttempts = 10;
    const CHECK_INTEVAL = 2000;
    const { maxErrorLength } = c.program;
    const spinner = ora('Waiting for emulator to boot...').start();

    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            execCLI(c, cli, command, { silent: true, timeout: 10000, maxErrorLength })
                .then((resp) => {
                    if (callback(resp)) {
                        clearInterval(interval);
                        spinner.succeed();
                        return resolve(true);
                    }
                    attempts++;
                    if (attempts === maxAttempts) {
                        clearInterval(interval);
                        spinner.fail('Can\'t connect to the running emulator. Try restarting it.');
                        return reject('Can\'t connect to the running emulator. Try restarting it.');
                    }
                }).catch(() => {
                    attempts++;
                    if (attempts > maxAttempts) {
                        clearInterval(interval);
                        spinner.fail('Can\'t connect to the running emulator. Try restarting it.');
                        return reject('Can\'t connect to the running emulator. Try restarting it.');
                    }
                });
        }, CHECK_INTEVAL);
    });
};

export const waitForWebpack = async (c, port) => {
    logTask(`waitForWebpack:${port}`);
    let attempts = 0;
    const maxAttempts = 10;
    const CHECK_INTEVAL = 2000;
    // const spinner = ora('Waiting for webpack to finish...').start();

    const extendConfig = getConfigProp(c, c.platform, 'webpackConfig', {});
    let devServerHost = extendConfig.devServerHost || '0.0.0.0';
    if (isRunningOnWindows && devServerHost === '0.0.0.0') {
        devServerHost = '127.0.0.1';
    }
    const url = `http://${devServerHost}:${port}/assets/bundle.js`;
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            axios.get(url).then((res) => {
                if (res.status === 200) {
                    clearInterval(interval);
                    // spinner.succeed();
                    return resolve(true);
                }
                attempts++;
                if (attempts === maxAttempts) {
                    clearInterval(interval);
                    // spinner.fail('Can\'t connect to webpack. Try restarting it.');
                    return reject('Can\'t connect to webpack. Try restarting it.');
                }
            }).catch(() => {
                attempts++;
                if (attempts > maxAttempts) {
                    clearInterval(interval);
                    // spinner.fail('Can\'t connect to webpack. Try restarting it.');
                    return reject('Can\'t connect to webpack. Try restarting it.');
                }
            });
        }, CHECK_INTEVAL);
    });
};
export const importPackageFromProject = (name) => {
    const c = Config.getConfig();
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const pkg = require(path.join(c.paths.project.nodeModulesDir, `/${name}`));
    if (pkg.default) return pkg.default;
    return pkg;
};

// TODO: remove this
export {
    logInfo,
    logDebug,
    logError,
    logTask,
    logEnd,
    logWarning,
    logSuccess,
};

export default {
    getBuildFilePath,
    getBuildsFolder,
    logWelcome,
    isPlatformSupported,
    isBuildSchemeSupported,
    isPlatformSupportedSync,
    getAppFolder,
    getAppTemplateFolder,
    logTask,
    logComplete,
    logError,
    initializeBuilder,
    logDebug,
    logInfo,
    logErrorPlatform,
    isPlatformActive,
    isSdkInstalled,
    checkSdk,
    logEnd,
    logWarning,
    configureIfRequired,
    getAppId,
    getAppTitle,
    getAppVersion,
    getAppVersionCode,
    writeCleanFile,
    getEntryFile,
    getGetJsBundleFile,
    getAppConfigId,
    getAppDescription,
    getAppAuthor,
    getAppLicense,
    logSuccess,
    getConfigProp,
    getIP,
    cleanPlatformIfRequired,
    checkPortInUse,
    resolveNodeModulePath,
    configureRnvGlobal,
    waitForEmulator
};
