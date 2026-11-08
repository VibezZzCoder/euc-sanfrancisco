// SF city host: unable12/slop-sanfrancisco@bdd5d37 (MIT, Kamil / Mr.doob).
// EUC lifecycle/selection/viewport integration: euc-newyork@cf56976 (MIT, VibezZzCoder).
// City scripts finish before this graph is imported by boot.js.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, positionView, metalness, roughness, vec2, vec4, smoothstep } from 'three/tsl';
import { ssr } from 'three/addons/tsl/display/SSRNode.js';
import { ClusteredLighting } from 'three/addons/lighting/ClusteredLighting.js';
import { ThirdPersonControllerManager } from './controllers.js';
import { CameraSystem, CAMERA_PRESETS } from './cameras.js';
import { TouchControls } from './touch-controls.js';
import { GamepadControls } from './gamepad-controls.js';
import { CityAudioSystem } from './audio-system.js';
import { createEucDynamicWorld, combineBodySources } from './euc-dynamic.js';
import { prepareEucRider } from './euc-rider.js';
import { releaseAppearanceCaches } from './euc/render/appearanceLoader.js';
import { PLAYABLE_RIDERS, RIDERS, isPlayableRider } from './euc-roster.js';
import { GameMenu, RiderSelection, MAIN_MENU_URL, menuOwner } from './game-menu.js';
import { EucHud, formatSpeed } from './euc-hud.js';
import { renderHudControls, bindHudSelectFocus } from './hud-controls.js';
import { TitleScreen } from './title-screen.js';
import { createViewPreferences } from './view-preferences.js';
import { createPlayerState } from './player-state.js';
import { createFrameRatePreference, createFramePacer, frameRateHealth } from './frame-rate.js';
import { createRenderResolutionPreference, drawingBufferRatio } from './render-resolution.js';
import { createGraphicsQualityPreference, createGraphicsQuality } from './graphics-quality.js';
import { buildSFSkateparks, skateparkPaintIntervals } from './sf-skateparks.js';
import { createSfNemesis } from './sf-nemesis.js';
import { SfChaseHud } from './sf-chase-hud.js';
import { createBookingDirector, BookingScreen } from './booking.js';
import { createBookingScene } from './booking-scene.js';
import { createSfBookingPlacement } from './sf-booking-placement.js';
import { createRenderStats } from './render-stats.js';

// Exploratory survey points, NOT accepted final staging. The intake is derived from the
// surveyed desk point; every transfer and release is independently checked at runtime.
const BOOKING_DESK = Object.freeze({ x: -286.649, y: 5.890, z: 1535.154, heading: 0.78335 });
const BOOKING_INTAKE = Object.freeze({ x: BOOKING_DESK.x + Math.sin(BOOKING_DESK.heading) * 1.5,
  y: BOOKING_DESK.y, z: BOOKING_DESK.z + Math.cos(BOOKING_DESK.heading) * 1.5,
  heading: BOOKING_DESK.heading + Math.PI });
const BOOKING_RELEASE = Object.freeze({ x: -275.715, y: 5.988, z: 1544.136, heading: 0.78335 });
// Only the first point has a bounded exploratory ride-away survey. The other
// positions are unsurveyed, short offsets along that sidewalk-aligned heading.
// Every candidate is independently checked, including its floor and departure.
const BOOKING_RELEASE_SITES = Object.freeze([0, 1.8, -1.8, 3.6, -3.6].map(distance => Object.freeze({
  x: BOOKING_RELEASE.x + Math.sin(BOOKING_RELEASE.heading) * distance,
  y: BOOKING_RELEASE.y,
  z: BOOKING_RELEASE.z + Math.cos(BOOKING_RELEASE.heading) * distance,
  heading: BOOKING_RELEASE.heading,
})));

export async function initApp(startup) {
  const city = window.NYC;
  if (city.THREE !== THREE) throw new Error('City and EUC must share one Three runtime.');
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  const loadingTrack = loadingOverlay.querySelector('.loader-track');
  const loadingFill = document.getElementById('loading-progress');
  const gameUI = [...document.querySelectorAll('.hud, #touch-controls, .popover')];
  const setGameUIEnabled = enabled => { for (const root of gameUI) root.inert = !enabled; };
  setGameUIEnabled(false);
  // One loading bar through every start-up stage (pattern: mrdoob/slop-newyork 737b769, MIT). Each stage owns a
  // share sized by its typical duration measured in desktop headless Chromium; the fill glides
  // through that share as a compositor transition, so it keeps moving while synchronous construction blocks the main
  // thread, paced by how fast the earlier stages ran on this device. Shader compilation reports real batch progress.
  const STAGE_MS = { graphics: 300, lighting: 70, data: 700, ground: 340, region: 1000, landmarks: 760,
    architecture: 1280, routes: 500, details: 3200, traffic: 100, grade: 1000, curbs: 5300, transit: 1650,
    parks: 500, rider: 5000, culling: 170, effects: 120, compile: 4100, firstFrame: 2100, gpu: 550 };
  const stageNames = Object.keys(STAGE_MS);
  const totalStageMs = stageNames.reduce((sum, name) => sum + STAGE_MS[name], 0);
  const loadingStartedAt = performance.now();
  let loadingStage = { from: 0, to: 0 };
  const setLoadingProgress = (value, seconds = 0.3) => {
    loadingTrack.classList.remove('is-indeterminate');
    loadingFill.style.transition = `transform ${seconds}s ${seconds > 0.3 ? 'linear' : 'ease'}`;
    loadingFill.style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
  };
  const setStageProgress = fraction => setLoadingProgress(loadingStage.from + (loadingStage.to - loadingStage.from) * fraction);
  function beginStage(message, name, glide = true) {
    loadingStatus.textContent = message;
    const before = stageNames.slice(0, stageNames.indexOf(name)).reduce((sum, n) => sum + STAGE_MS[n], 0);
    loadingStage = { from: before / totalStageMs, to: (before + STAGE_MS[name]) / totalStageMs };
    if (!glide) return setLoadingProgress(loadingStage.from);
    const pace = before >= 1000 ? Math.min(4, Math.max(0.5, (performance.now() - loadingStartedAt) / before)) : 1;
    setLoadingProgress(loadingStage.to, STAGE_MS[name] * pace / 1000);
  }
  const nextTask = () => globalThis.scheduler?.yield ? scheduler.yield() : new Promise(resolve => setTimeout(resolve, 0));
  async function stage(message, name, glide) {
    if (startup.failed) throw new Error('Startup interrupted');
    beginStage(message, name, glide);
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 100);
      requestAnimationFrame(() => { clearTimeout(timeout); setTimeout(resolve, 0); });
    });
    if (startup.failed) throw new Error('Startup interrupted');
  }

  const params = new URLSearchParams(location.search);
  startup.phase('graphics');
  await stage('Initializing graphics…', 'graphics');
  const renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance',
    reversedDepthBuffer: true, forceWebGL: params.get('webgpu') === '0' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const resolutionPreference = createRenderResolutionPreference();
  const graphicsPreference = createGraphicsQualityPreference();
  let renderScale = resolutionPreference.scale;
  let renderWidth = Math.max(1, container.clientWidth || innerWidth);
  let renderHeight = Math.max(1, container.clientHeight || innerHeight);
  renderer.setDrawingBufferSize(renderWidth, renderHeight, drawingBufferRatio(renderWidth, renderHeight, renderScale));
  renderer.shadowMap.enabled = true;
  renderer.lighting = new ClusteredLighting(256, 32, 28, 48);
  container.append(renderer.domElement);

  let rendererInit = null, compileWork = null, runtimeCompile = null, firstFrameWork = null, riderPreparationWork = null;
  let rendererBusy = false, stopped = false, pageAway = false;
  let stopRuntime = async () => {};
  const ownedDisposals = [];
  const startupPreparation = new AbortController();
  const graphicsFailed = error => {
    startup.phase('graphics');
    startup.fail(error instanceof Error ? error : new Error(error?.message || 'The graphics device was lost.'));
  };
  renderer.onDeviceLost = graphicsFailed;
  renderer.onError = graphicsFailed;
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); graphicsFailed(new Error('The WebGL2 graphics context was lost.'));
  });
  // Boot invokes additive stops concurrently. This owner drains readers before GPU disposal.
  startup.onStop(async () => {
    stopped = true;
    startupPreparation.abort();
    setGameUIEnabled(false);
    const runtimeStop = stopRuntime(); // close modals synchronously before boot focuses Retry
    try { await renderer.setAnimationLoop(null); } catch { /* Init may still be pending. */ }
    await runtimeStop;
    for (const work of [rendererInit, riderPreparationWork, compileWork, runtimeCompile, firstFrameWork]) {
      try { await work; } catch { /* Failed work owns resources until settled. */ }
    }
    releaseAppearanceCaches(); // also covers cancellation before the active manager existed
    await renderer.setAnimationLoop(null);
    for (const dispose of ownedDisposals.reverse()) {
      try { dispose(); } catch (error) { console.error('[graphics:dispose]', error); }
    }
    await renderer.dispose();
  });
  rendererInit = renderer.init();
  await rendererInit;
  if (startup.failed) return;
  document.body.dataset.backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
  document.getElementById('hud-backend').textContent = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';

  startup.phase('city');
  await stage('Creating San Francisco sky and environment lighting…', 'lighting');
  const scene = new THREE.Scene();
  const lightingSystem = new city.LightingSystem(scene, renderer);
  ownedDisposals.push(() => {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of [].concat(object.material || [])) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
    lightingSystem.dispose?.(); scene.environment?.dispose(); scene.clear();
  });
  await stage('Loading terrain, buildings and the San Francisco region…', 'data');
  await city.loadCityData();
  if (startup.failed) return;
  await stage('Building hills, streets and waterfronts…', 'ground');
  const cityGrid = city.buildSFGround(scene, { deferCurbSurfaces: true });
  ownedDisposals.push(() => cityGrid.terrain?.dispose());
  // Leaving the core (a regional arrival): pure-coarsening tile rebuilds run over later frames (~4 ms per call, one
  // tile minimum); any tile needing a finer level still rebuilds at once. Drawing-only; physics is unaffected.
  cityGrid.terrain?.setLodBudget?.(4);
  await stage('Building the regional landscape…', 'region');
  const region = city.buildSFRegion(scene, { paintIntervals: skateparkPaintIntervals });
  ownedDisposals.push(() => region.disposeTerrainCache());
  // Cold arrivals: uncached camera-threshold regional LODs build over later frames (~4 ms each, one tile minimum) and
  // publish together when complete; rider-near/seam tiles stay synchronous. Drawing-only; physics is unaffected.
  region.setLodBudget?.(4);
  await stage('Building landmarks and bridges…', 'landmarks');
  const landmarks = city.buildLandmarks(scene);
  const bridges = city.buildSFBridges(scene);
  city.bridgeDeckAt = bridges.bridgeDeckAt;
  await stage('Building San Francisco architecture…', 'architecture');
  const cityBlocks = city.buildCityBlocks(scene);
  const allColliders = [...landmarks.colliders, ...bridges.colliders, ...cityBlocks.colliders, ...(cityGrid.colliders || [])];
  await stage('Finding San Francisco street routes…', 'routes');
  // Preserve core navigation inputs. Regional patches must not turn core roads into new land.
  const patchesEnabled = city.Terrain.patchesEnabled;
  city.Terrain.patchesEnabled = false;
  let roadNetwork, streetDetails, trafficSystem, gradeSeparation, highwayTraffic, transit;
  try {
    // Same calls in the same order; yielding between them only lets the loader paint. Nothing else runs
    // meanwhile (no render loop, input or resize owners exist yet), and patchesEnabled stays false throughout.
    roadNetwork = city.buildRoadNetwork(cityGrid.sidewalks, [...cityGrid.footprints, ...allColliders.filter(c => !c.obb)]);
    await stage('Placing street furniture…', 'details');
    streetDetails = city.buildSFStreetDetails(scene, roadNetwork, allColliders);
    await stage('Creating traffic and pedestrian routes…', 'traffic');
    trafficSystem = city.createTrafficSystem(scene, cityGrid.sidewalks, [], { network: roadNetwork });
    await stage('Building tunnels, ramps and highway decks…', 'grade');
    const gradeTopStart = city.ride.tops.length;
    // Building masses let an approach under a building (Broadway's east portal) get a slab and portal frame.
    gradeSeparation = city.buildGradeSeparation(scene, roadNetwork, { structures: cityBlocks.colliders.filter(c => c.obb) });
    city.GradeSeparation = gradeSeparation;
    cityBlocks.finishTunnelOpenings(gradeSeparation);
    await stage('Fitting curbs and sidewalks to the hills…', 'curbs');
    cityGrid.finishCurbSurfaces(gradeSeparation.terrainCuts, gradeTopStart);
    cityGrid.terrain?.rebuild();
    await stage('Adding highway traffic, transit and road markings…', 'transit');
    highwayTraffic = city.createHighwayTraffic(scene, gradeSeparation.highwayLanes);
    transit = city.buildSFTransit(scene);
    if (trafficSystem.network) city.buildRoadPaint(scene, trafficSystem.network);
  } finally { city.Terrain.patchesEnabled = patchesEnabled; }

  // Fit authored surfaces to the finalized city, without changing road-network inputs,
  // furniture, trees or pedestrian tracks. Physical construction precedes sampler handoff.
  await stage('Building UN Plaza and Zion riding lines…', 'parks');
  buildSFSkateparks(scene, city);

  await stage('Preparing the selected rider, wheel and controls…', 'rider');
  const playerState = createPlayerState({ isPlayableRider });
  const booking = createBookingDirector();
  let bookingSpawnProtected = false;
  let bookingProtectedExit = null;
  let bookingClearancePending = false;
  const rider = [params.get('rider'), playerState.rider].find(isPlayableRider) ?? PLAYABLE_RIDERS[0];
  riderPreparationWork = prepareEucRider(rider, { signal: startupPreparation.signal });
  const appearance = await riderPreparationWork;
  if (startup.failed) return;
  const dynamicWorld = createEucDynamicWorld(combineBodySources(trafficSystem, highwayTraffic, transit));
  const controllerManager = new ThirdPersonControllerManager(scene,
    [...allColliders.filter(c => !c.rideIgnore).flatMap(c => c.parts || [c]), ...gradeSeparation.colliders],
    { rider, appearance, dynamicWorld, inputEnabled: false });
  // Static construction is finished. The sampler owns exact packed support and
  // shared bodies; retire the build registry only after full manager creation.
  controllerManager.eucSampler.releaseConstructionRegistry(city.ride);
  stopRuntime = async () => {
    controllerManager.setInputEnabled(false);
    try { await compileWork; } catch { /* Drain shader readers before the rig. */ }
    await controllerManager.dispose();
  };
  playerState.restore(pose => controllerManager.teleportActiveTo(pose.x, pose.z, pose.heading, pose.y).succeeded);
  function savePlayerState() {
    // Preserve the previously committed checkpoint throughout capture/intake, including pagehide.
    if (booking.active) return;
    const entity = controllerManager.getActiveEntity();
    playerState.save({ x: entity.position.x, y: entity.position.y, z: entity.position.z, heading: entity.heading }, entity.riderId);
  }
  const cameraSystem = new CameraSystem(renderer.domElement, controllerManager);
  cameraSystem.onResize(renderWidth, renderHeight);
  const touchControls = new TouchControls(controllerManager);
  const soundButton = document.getElementById('btn-sound');
  const audioSystem = new CityAudioSystem({ controllerManager, trafficSystem, highwayTraffic, streetDetails },
    { onStateChange: updateSoundButton });
  const nemesis = params.get('cop') === '0' ? null : createSfNemesis({ scene,
    sampler: controllerManager.eucSampler, network: roadNetwork,
    getPlayer: () => controllerManager.getActiveEntity(), camera: cameraSystem.camera });
  if (nemesis) ownedDisposals.push(() => nemesis.dispose());
  const bookingOfficer = nemesis ? {
    beginBooking: (...args) => nemesis.beginBooking(...args),
    presentBooking: (...args) => nemesis.presentBooking(...args),
    endBooking: () => nemesis.endBooking(),
    onPaperTorn: () => { nemesis.audioView.hit++; }, // NYC's existing one-shot thump
  } : null;
  const bookingScene = nemesis ? createBookingScene(scene, BOOKING_DESK, bookingOfficer) : null;
  if (bookingScene) ownedDisposals.push(() => bookingScene.dispose());
  audioSystem.setChaser(nemesis);
  let bookingScreen = null;
  function updateSoundButton() {
    const reason = audioSystem.unavailableReason;
    for (const id of ['sound-unavailable', 'title-audio-status', 'menu-audio-status']) {
      const element = document.getElementById(id);
      if (element) { element.textContent = reason ?? ''; element.hidden = !reason; }
    }
    const notice = document.getElementById('sound-unavailable');
    document.body.style.setProperty('--sound-notice-space', `${reason ? Math.ceil(notice.getBoundingClientRect().height) + 8 : 0}px`);
    soundButton.disabled = !audioSystem.supported;
    soundButton.setAttribute('aria-pressed', String(audioSystem.supported && audioSystem.enabled));
    soundButton.setAttribute('aria-label', reason ?? (audioSystem.enabled ? 'Mute sound' : 'Enable sound'));
    soundButton.title = reason ?? `${audioSystem.enabled ? 'Mute' : 'Enable'} sound [N]`;
    soundButton.querySelector('use').setAttribute('href', audioSystem.supported && audioSystem.enabled ? '#i-sound' : '#i-sound-off');
  }
  soundButton.addEventListener('click', () => audioSystem.setEnabled(!audioSystem.enabled));
  updateSoundButton();
  stopRuntime = async () => {
    bookingScreen?.dispose(); clearBookingSpawnProtection();
    controllerManager.setInputEnabled(false); touchControls.setEnabled(false); audioSystem.dispose();
    try { await compileWork; } catch { /* Drain startup readers. */ }
    await controllerManager.dispose();
  };

  await stage('Preparing scene visibility and shadows…', 'culling');
  const cullingRoots = ['SFGround', 'SFBuildings', 'SFStreetDetails', 'SFLandmarks', 'SFBridges',
    'ManhattanCityGrid', 'ManhattanCityBlocks', 'ManhattanStreetDetails', 'ManhattanLandmarks', 'Boroughs']
    .map(name => scene.getObjectByName(name)).filter(Boolean);
  const cullingStats = city.setupSceneCulling(scene, cullingRoots, lightingSystem.sunLight.shadow);
  // WebGL2 needs ordinary instance transforms, not WebGPU storage attributes.
  if (renderer.backend.isWebGPUBackend) scene.traverse(object => {
    if (object.isInstancedMesh) object.instanceMatrix = new THREE.StorageInstancedBufferAttribute(object.instanceMatrix.array, 16);
  });

  await stage('Setting up San Francisco fog, reflections and bloom…', 'effects');
  const scenePass = pass(scene, cameraSystem.camera);
  scenePass.renderTarget.storeMultisampledColorBuffer = false;
  // Selective NYC js/main.js@9c4cfc9 (runtime cf56976), lines 295–329:
  // reject matte rays, refine coarse hits, and keep blur off rejected surfaces.
  // Preserve SF's depth-based aerial fog and all existing pass/disposal owners.
  const ssrFade = smoothstep(360, 180, positionView.z.negate());
  const maxSSRRoughness = 0.75;
  const sceneMRT = mrt({ output, normal: normalView,
    metalRough: vec2(roughness.lessThan(maxSSRRoughness).select(metalness.mul(ssrFade), 0), roughness) });
  sceneMRT.setBlendMode('normal', new THREE.BlendMode(THREE.MaterialBlending));
  sceneMRT.setBlendMode('metalRough', new THREE.BlendMode(THREE.MaterialBlending));
  scenePass.setMRT(sceneMRT);
  const scenePassColor = scenePass.getTextureNode('output');
  const scenePassDepth = scenePass.getTextureNode('depth');
  const scenePassNormal = scenePass.getTextureNode('normal');
  const scenePassMetalRough = scenePass.getTextureNode('metalRough');
  const ssrPass = ssr(scenePassColor, scenePassDepth, scenePassNormal, {
    metalnessNode: scenePassMetalRough.r, roughnessNode: scenePassMetalRough.g, camera: cameraSystem.camera });
  ssrPass.resolutionScale = 0.5; ssrPass.blurQuality = 1;
  ssrPass.maxDistance.value = 42; ssrPass.thickness.value = 0.85;
  ssrPass.quality.value = 0.25; ssrPass.binaryRefine = true;
  ssrPass.intensity.value = 0.5; ssrPass.screenEdgeFadeBlack = true;
  const reflectionMask = scenePassMetalRough.r.greaterThan(0)
    .select(smoothstep(maxSSRRoughness, 0.55, scenePassMetalRough.g), 0);
  // NYC 4a88f17: three lazy effect graphs, shared MRT/scene/shadow ownership. Keep SF fog in all tiers.
  const graphics = createGraphicsQuality({
    shadow: lightingSystem.sunLight.shadow,
    createPipeline: quality => {
      const grade = city.createPostProcessing(renderer, scenePassColor,
        quality === 'high' ? ssrPass.mul(reflectionMask) : vec4(0),
        scenePassDepth, cameraSystem.camera, lightingSystem, { glow: quality !== 'low' });
      const pipeline = new THREE.RenderPipeline(renderer, grade.outputNode);
      return {
        pipeline, grade,
        applyTime: id => grade.applyPreset(id),
        park() {
          grade.park();
          if (quality === 'high') ssrPass.setSize(32, 32);
        },
        dispose() { pipeline.dispose(); grade.dispose(); }
      };
    }
  });
  ownedDisposals.push(() => { graphics.dispose(); ssrPass.dispose(); scenePass.dispose(); });
  graphics.apply(graphicsPreference.value);
  const renderPipeline = { render: () => graphics.current.pipeline.render() };

  let titleScreen = null, gameMenu = null;
  let lifecycleReady = false, dirtyView = true, lastOwner = null, currentFps = 0;
  let windowFocused = document.hasFocus(), bookingSuspended = false;
  let lastTime = null, elapsed = 0, titleElapsed = 0, frameCount = 0, fpsTimer = 0, nextPlayerSave = 0, warmedUp = false;
  const cameraButtons = [...document.querySelectorAll('[data-camera]')];
  const timeButtons = [...document.querySelectorAll('[data-time]')];
  const viewPreferences = createViewPreferences({ cameraIds: CAMERA_PRESETS.map(p => p.id), timeIds: timeButtons.map(b => b.dataset.time) });
  const frameRatePreference = createFrameRatePreference();
  const framePacer = createFramePacer(frameRatePreference.value);
  const eucHud = new EucHud(document);
  const chaseHud = nemesis ? new SfChaseHud(document) : null;
  const gamepadControls = new GamepadControls(controllerManager, cameraSystem, {
    onCycleRider: step => gameMenu?.browse(step),
    onToggleMenu: () => { if (mapSystem.isFullMapOpen) mapSystem.toggleFullMap(false); gameMenu?.openPause(); },
    onCycleCamera: cycleCamera,
    onToggleMap: () => mapSystem.toggleFullMap(!mapSystem.isFullMapOpen),
    onCloseMap: () => mapSystem.toggleFullMap(false),
    isMapOpen: () => owner() === 'map',
    onMapInput: (input, dt) => { if (!input.neutral) setPromptDevice('gamepad'); mapSystem.applyGamepadInput(input, dt); },
    onActivity: () => setPromptDevice('gamepad')
  });
  let promptDevice = touchControls.available ? 'touch' : 'keyboard';
  function setPromptDevice(device) {
    if (promptDevice === device) return;
    promptDevice = device; document.body.dataset.input = device;
    mapSystem.setInputDevice(device); renderControlHints();
  }
  function renderControlHints() {
    renderHudControls(document, promptDevice);
    mapSystem.layoutStatus?.();
  }
  let locationText = '';
  function renderLocation(label) {
    if (label === locationText) return;
    locationText = label;
    const [place, streets] = label.includes(' · ') ? label.split(' · ', 2)
      : label.includes(' & ') ? ['', label] : [label, ''];
    const nodes = [];
    if (place) {
      const element = document.createElement('div'); element.className = 'location-place'; element.textContent = place; nodes.push(element);
    }
    if (streets) {
      const row = document.createElement('div'); row.className = 'location-signs';
      for (const name of streets.split(' & ')) {
        const element = document.createElement('span'); element.className = 'street-sign'; element.textContent = name; row.append(element);
      }
      nodes.push(row);
    }
    document.getElementById('hud-location').replaceChildren(...nodes);
  }
  function selectCamera(id, snap = false, remember = true) {
    cameraSystem.setCameraPreset(id, snap);
    cameraButtons.forEach(button => {
      const selected = button.dataset.camera === cameraSystem.activePresetId;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('hud-active-camera').textContent = cameraSystem.getActivePreset().name;
    if (remember) viewPreferences.setCamera(cameraSystem.getActivePreset().id);
    dirtyView = true;
  }
  function cycleCamera(step) {
    const index = CAMERA_PRESETS.findIndex(p => p.id === cameraSystem.activePresetId);
    selectCamera(CAMERA_PRESETS[(index + step + CAMERA_PRESETS.length) % CAMERA_PRESETS.length].id, true);
  }
  function selectTime(id, remember = true) {
    lightingSystem.applyPreset(id); graphics.applyTime(lightingSystem.activePresetId);
    timeButtons.forEach(button => {
      const selected = button.dataset.time === lightingSystem.activePresetId;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (remember) viewPreferences.setTime(lightingSystem.activePresetId);
    dirtyView = true;
  }
  function updateCommittedRider() {
    const entity = controllerManager.getActiveEntity();
    titleScreen?.setRider(entity.riderId);
    for (const id of ['hud-active-mode', 'rider-button-name']) document.getElementById(id).textContent = RIDERS[entity.riderId].name;
    savePlayerState(); // createPlayerState rejects writes until Ride authorizes them
  }
  function teleportTo(x, z, heading = Math.PI, referenceY = Infinity, policy = {}) {
    const destination = controllerManager.teleportActiveTo(x, z, heading, referenceY, policy);
    if (!destination.succeeded) return destination;
    controllerManager.resetInput(); touchControls.reset(); gamepadControls.reset();
    cameraSystem.resetForTeleport(); selectCamera('chase', true, false);
    mapSystem.waypoint = { x: destination.x, z: destination.z, name: city.getLocationLabel(destination.x, destination.z) };
    dirtyView = true;
    return destination;
  }
  const mapSystem = new city.NYCMapSystem({ controllerManager, cameraSystem, trafficSystem,
    allBlocks: cityBlocks.allBlocks, onToggle: open => { syncLifecycle(); if (open) mapSystem.setInputDevice(promptDevice); }, onTeleport: teleportTo });
  mapSystem.chaser = nemesis; // The map reads only the officer's published presence and position.
  mapSystem.enabled = false;
  function owner() {
    return menuOwner({ failed: startup.failed || stopped, hidden: document.hidden, pageAway,
      booking: booking.active, menu: gameMenu?.isOpen, map: mapSystem.isFullMapOpen,
      title: !titleScreen || titleScreen.isOpen || !titleScreen.started });
  }
  let renderStats = null;
  function resetFramePacing() { framePacer.reset(); frameCount = fpsTimer = 0; renderStats?.reset(); }
  function resetFrameClock() { lastTime = null; resetFramePacing(); }
  function syncLifecycle() {
    const current = owner();
    const suspended = booking.active && (current !== 'booking' || !windowFocused || !document.hasFocus());
    const suspensionChanged = suspended !== bookingSuspended;
    bookingSuspended = suspended;
    bookingScreen?.setSuspended(suspended);
    audioSystem.setPaused(current !== 'riding' && (current !== 'booking' || suspended));
    if (suspensionChanged && lifecycleReady) resetFrameClock();
    if (current === lastOwner) return;
    lastOwner = current; dirtyView = true;
    if (lifecycleReady) resetFrameClock();
    const riding = current === 'riding';
    controllerManager.setInputEnabled(riding); controllerManager.resetInput();
    touchControls.setEnabled(riding); gamepadControls.setEnabled(riding); gamepadControls.reset();
    cameraSystem._clearPointers(); mapSystem.cancelGestures();
    mapSystem.enabled = riding || current === 'map';
  }
  function compileRider({ group }, { signal }) {
    const previous = runtimeCompile;
    const work = (async () => {
      if (previous) await previous;
      if (signal.aborted || stopped) throw new DOMException('Compilation cancelled', 'AbortError');
      rendererBusy = true;
      renderStats?.reset();
      const target = renderer.getRenderTarget(), previousMRT = renderer.getMRT(), culled = [];
      try {
        scene.add(group);
        group.traverse(object => { if (object.frustumCulled) { culled.push(object); object.frustumCulled = false; } });
        renderer.setRenderTarget(scenePass.renderTarget); renderer.setMRT(sceneMRT);
        await renderer.compileAsync(group, cameraSystem.camera, scene);
      } finally {
        renderer.setMRT(previousMRT); renderer.setRenderTarget(target); group.removeFromParent();
        for (const object of culled) object.frustumCulled = true;
        rendererBusy = false; dirtyView = true; scheduleViewportResize();
      }
    })();
    runtimeCompile = work;
    work.finally(() => { if (runtimeCompile === work) runtimeCompile = null; }).catch(() => {});
    return work;
  }
  const riderSelection = new RiderSelection({ manager: controllerManager, audio: audioSystem, compile: compileRider,
    onCommit: () => { updateCommittedRider(); dirtyView = true; } });
  gameMenu = new GameMenu({ root: document.getElementById('game-menu'), riders: PLAYABLE_RIDERS, specs: RIDERS,
    getRider: () => controllerManager.getActiveEntity().riderId,
    canOpen: view => !startup.failed && !stopped && !document.hidden && !pageAway && !booking.active && !mapSystem.isFullMapOpen
      && !titleScreen?.preparing && (view === 'picker' || titleScreen?.started),
    onChange: () => { closePopovers(); titleScreen?.resetInput(); syncLifecycle(); },
    onConfirm: id => riderSelection.prepare(id), onCancel: () => riderSelection.cancel(),
    onActivity: () => setPromptDevice('gamepad'),
    onReload: () => {
      savePlayerState(); riderSelection.cancel();
      const url = new URL(location.href); url.searchParams.set('rider', controllerManager.getActiveEntity().riderId);
      try { history.replaceState(history.state, '', url); } catch { /* Reload remains usable. */ }
      location.reload();
    },
    onLeave: () => { savePlayerState(); pageAway = true; riderSelection.cancel(); syncLifecycle(); location.assign(MAIN_MENU_URL); }
  });
  titleScreen = new TitleScreen({ root: document.getElementById('title-overlay'), riders: PLAYABLE_RIDERS,
    onRider: id => gameMenu.openPicker(id), onBrowse: step => gameMenu.browse(step),
    isBlocked: () => gameMenu.isOpen || stopped || pageAway,
    getRider: () => controllerManager.getActiveEntity().riderId, getRiderName: id => RIDERS[id].name,
    onActivity: () => setPromptDevice('gamepad'),
    onPrepareStart: () => riderSelection.prepare(controllerManager.getActiveEntity().riderId),
    onCancelStart: () => riderSelection.cancel(),
    onStart: () => {
      playerState.authorize(); cameraSystem.setTitleOrbit(false); selectCamera(viewPreferences.camera, true, false);
      setGameUIEnabled(true); syncLifecycle(); savePlayerState();
    }
  });
  stopRuntime = async () => {
    bookingScreen?.dispose(); // synchronous, before boot focuses Retry or waits on GPU readers
    trafficSystem.setPresentationClearance(null);
    clearBookingSpawnProtection();
    controllerManager.setInputEnabled(false); gamepadControls.setEnabled(false); touchControls.setEnabled(false);
    gameMenu.dispose(); titleScreen.dispose(); cameraSystem._clearPointers();
    if (mapSystem.isFullMapOpen) mapSystem.toggleFullMap(false);
    mapSystem.enabled = false; setGameUIEnabled(false); audioSystem.dispose();
    await riderSelection.dispose();
    try { await compileWork; } catch { /* Active rig must survive startup compilation. */ }
    await controllerManager.dispose();
  };

  if (nemesis) {
    // Reject an unintended stacked floor even when the sampler finds a valid nearby elevation.
    function checkedBookingTeleport(x, z, heading, y, policy) {
      // The rider faces the desk. Intake only needs a stationary checked pose;
      // the 1.2 m ride-away corridor applies solely to the outside release.
      const intake = x === BOOKING_INTAKE.x && z === BOOKING_INTAKE.z;
      const checkedPolicy = { ...policy, departure: intake ? 0 : 1.2 };
      const preview = controllerManager.findTeleportPosition(x, z, heading, y, checkedPolicy);
      if (!preview || Math.abs(preview.y - y) > 0.5) return null;
      const result = controllerManager.teleportActiveTo(x, z, heading, y, checkedPolicy);
      if (result?.succeeded) {
        // The live world was checked before the controller committed. Protect the accepted
        // area from future pool spawns, including the first camera jump after a remote Skip.
        trafficSystem.setSpawnExclusions([
          { x: BOOKING_DESK.x, z: BOOKING_DESK.z, radius: 6 },
          { x, z, radius: 4 },
        ]);
        bookingSpawnProtected = true;
        bookingProtectedExit = { x, z };
      }
      return result;
    }
    const checkedManager = { teleportActiveTo: checkedBookingTeleport };
    const placement = createSfBookingPlacement({ manager: checkedManager, booking, chase: nemesis.director,
      intake: [BOOKING_INTAKE], release: BOOKING_RELEASE_SITES });
    // One conservative envelope covers all props, the complete posed officer and paddle,
    // lamp, exhaust and both torn-paper trajectories, including the gaps between them.
    // Check actual support, statics and current actors; never reserve an actor route.
    function stagingClear() {
      const s = Math.sin(BOOKING_DESK.heading), c = Math.cos(BOOKING_DESK.heading);
      const sampler = controllerManager.eucSampler;
      for (const [x, z, halfWidthMetres, halfLengthMetres, height] of [
        [BOOKING_DESK.x - c * 0.24 - s * 0.825, BOOKING_DESK.z + s * 0.24 - c * 0.825, 2.15, 1.475, 2.4],
      ]) {
        const ground = sampler.findPlacementTarget({ x, z, headingY: BOOKING_DESK.heading, referenceY: BOOKING_DESK.y,
          registeredSurfaceOnly: true, hull: { halfWidthMetres, halfLengthMetres, heightMetres: height } });
        if (!ground || Math.abs(ground.y - BOOKING_DESK.y) > 0.12) return false;
        // The prop group is level, not draped: refuse unsupported or steep corners.
        for (const u of [-halfWidthMetres, halfWidthMetres]) for (const v of [-halfLengthMetres, halfLengthMetres]) {
          const px = x + c * u + s * v, pz = z - s * u + c * v;
          const corner = sampler.sampleGround(px, pz, { normal: {} }, BOOKING_DESK.y);
          if (!corner || corner.offCourse || !Number.isFinite(corner.height)
            || Math.abs(corner.height - BOOKING_DESK.y) > 0.12) return false;
        }
        const body = { x, z, headingY: BOOKING_DESK.heading, halfWidthMetres, halfLengthMetres,
          minY: BOOKING_DESK.y - 0.6, maxY: BOOKING_DESK.y + height, floorY: ground.y, velocityX: 0, velocityZ: 0 };
        if (!sampler.isVolumeClear(body) || !dynamicWorld.canPlace({ reason: 'recover', body })) return false;
      }
      return true;
    }
    function finishBooking() {
      if (!placement.release()) return false;
      trafficSystem.setPresentationClearance(null);
      bookingClearancePending = false;
      bookingScene.end(); nemesis.hide(); // also retire an unstaged capture/Skip; release already set cooldown
      cameraSystem.setCinematic(null);
      controllerManager.resetInput(); touchControls.reset(); gamepadControls.reset();
      cameraSystem.resetForTeleport(); selectCamera('chase', true, false);
      bookingScreen.update(booking.state); syncLifecycle();
      container.focus({ preventScroll: true });
      savePlayerState(); // actual accepted outside pose, never the provisional coordinate
      dirtyView = true;
      return true;
    }
    bookingScreen = new BookingScreen({ root: document.getElementById('booking-overlay'), onRelease: finishBooking });
    // Kept on the screen owner to keep all transfer attempts behind one checked path.
    bookingScreen.transfer = () => {
      if (!stagingClear() || !placement.transfer()) return false;
      // Draw-only clearance for the temporary desk: walking, routes and physical bodies continue.
      // Pad the rotated stage envelope for pedestrian silhouettes, not just their centres.
      const s = Math.sin(BOOKING_DESK.heading), c = Math.cos(BOOKING_DESK.heading);
      const x = BOOKING_DESK.x - c * 0.24 - s * 0.825;
      const z = BOOKING_DESK.z + s * 0.24 - c * 0.825;
      const rx = Math.abs(c) * 2.15 + Math.abs(s) * 1.475 + 0.8;
      const rz = Math.abs(s) * 2.15 + Math.abs(c) * 1.475 + 0.8;
      trafficSystem.setPresentationClearance({ minX: x - rx, maxX: x + rx, minZ: z - rz, maxZ: z + rz });
      return true;
    };
  }

  function startBooking() {
    const entity = controllerManager.getActiveEntity();
    if (!booking.start(RIDERS[entity.riderId].name, nemesis.director.state.knockdowns)) return;
    closePopovers(); bookingScreen.update(booking.state); syncLifecycle();
  }

  function clearBookingSpawnProtection() {
    if (bookingSpawnProtected) trafficSystem.setSpawnExclusions();
    bookingSpawnProtected = false;
    bookingProtectedExit = null;
  }

  function retireBookingSpawnProtection(entity) {
    if (!bookingSpawnProtected || booking.active) return;
    const nearExit = p => bookingProtectedExit && Math.hypot(p.x - bookingProtectedExit.x, p.z - bookingProtectedExit.z) <= 100;
    // The just-completed traffic update covered the exit, or another checked teleport has
    // already taken the player elsewhere before that update could happen.
    if (nearExit(cameraSystem.currentPos) || !nearExit(entity.position)) {
      clearBookingSpawnProtection();
    }
  }

  function listen(target, name, callback, options) {
    target.addEventListener(name, callback, options);
    ownedDisposals.push(() => target.removeEventListener(name, callback, options));
  }
  const popovers = [...document.querySelectorAll('.popover[popover]')];
  const supportsPopover = typeof HTMLElement.prototype.togglePopover === 'function';
  function closePopovers() {
    if (supportsPopover) for (const pop of popovers) if (pop.matches(':popover-open')) pop.hidePopover();
  }
  for (const pop of popovers) listen(pop, 'beforetoggle', event => {
    const invoker = document.querySelector(`[popovertarget="${pop.id}"]`);
    invoker?.classList.toggle('is-open', event.newState === 'open');
    if (event.newState !== 'open') return;
    const anchor = document.getElementById(pop.dataset.anchor) || invoker;
    const align = document.getElementById(pop.dataset.align) || invoker;
    const rect = anchor.getBoundingClientRect();
    const aboveSpace = Math.max(0, rect.top - 20), belowSpace = Math.max(0, innerHeight - rect.bottom - 20);
    let above = pop.dataset.side === 'above';
    if ((above ? aboveSpace : belowSpace) < 160) above = aboveSpace > belowSpace;
    pop.style.display = 'block'; const width = pop.getBoundingClientRect().width; pop.style.removeProperty('display');
    pop.style.right = `${Math.max(8, Math.min(innerWidth - align.getBoundingClientRect().right, innerWidth - width - 8))}px`;
    pop.style.top = above ? 'auto' : `${rect.bottom + 8}px`;
    pop.style.bottom = above ? `${innerHeight - rect.top + 8}px` : 'auto';
    pop.style.maxHeight = `${above ? aboveSpace : belowSpace}px`;
  });
  for (const button of cameraButtons) listen(button, 'click', () => { selectCamera(button.dataset.camera, true); closePopovers(); });
  for (const button of timeButtons) listen(button, 'click', () => selectTime(button.dataset.time));
  listen(document.getElementById('cam-prev'), 'click', () => cycleCamera(-1));
  listen(document.getElementById('cam-next'), 'click', () => cycleCamera(1));
  listen(document.getElementById('btn-rider'), 'click', () => gameMenu.openPicker());
  listen(document.getElementById('btn-game-menu'), 'click', () => gameMenu.openPause());
  listen(document.getElementById('btn-open-map'), 'click', () => mapSystem.toggleFullMap(true));
  for (const button of document.querySelectorAll('[data-teleport]')) listen(button, 'click', () => {
    const destination = city.TELEPORT_LOCATIONS[button.dataset.teleport];
    if (destination) teleportTo(destination.x, destination.z, destination.heading, destination.y ?? Infinity,
      { departure: destination.exact === true ? destination.departure ?? 0 : 0, exact: destination.exact === true });
    closePopovers();
  });
  const fogSelect = document.getElementById('fog-preset');
  lightingSystem.setFogPreset(['clear', 'haze', 'marine'].includes(params.get('fog')) ? params.get('fog') : 'haze');
  fogSelect.value = lightingSystem.fogPreset;
  listen(fogSelect, 'change', () => { lightingSystem.setFogPreset(fogSelect.value); dirtyView = true; });
  const fpsLimit = document.getElementById('fps-limit'); fpsLimit.value = frameRatePreference.value;
  listen(fpsLimit, 'change', () => { if (frameRatePreference.set(fpsLimit.value)) { framePacer.set(frameRatePreference.value); resetFramePacing(); dirtyView = true; } });
  const resolutionLimit = document.getElementById('render-resolution'); resolutionLimit.value = resolutionPreference.value;
  listen(resolutionLimit, 'change', () => { if (resolutionPreference.set(resolutionLimit.value)) scheduleViewportResize(); });
  const graphicsLimit = document.getElementById('graphics-quality');
  graphicsLimit.value = graphicsPreference.value; graphicsLimit.dataset.quality = graphicsPreference.value;
  listen(graphicsLimit, 'change', () => {
    if (graphicsPreference.set(graphicsLimit.value)) {
      graphicsLimit.setAttribute('aria-busy', 'true');
      dirtyView = true; // Apply latest choice only, after compile ownership drains.
    }
  });
  // Preserve native button/select activation. Deliberate canvas activation restores riding focus.
  for (const control of [fpsLimit, resolutionLimit, graphicsLimit, fogSelect]) {
    bindHudSelectFocus(control, () => controllerManager.resetInput(), listen);
  }
  // Keep keyboard activation focus; return pointer-activated HUD buttons to riding input.
  listen(document, 'click', event => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button && event.detail > 0 && !button.closest('dialog, #title-overlay')
      && owner() === 'riding' && document.activeElement === button) button.blur();
  });
  const hudToggle = document.getElementById('btn-toggle-hud');
  listen(hudToggle, 'click', () => {
    const minimized = document.body.classList.toggle('hud-minimized');
    hudToggle.setAttribute('aria-pressed', String(minimized)); hudToggle.setAttribute('aria-label', minimized ? 'Show HUD' : 'Hide HUD');
    hudToggle.title = minimized ? 'Show the HUD [H]' : 'Clean view: hide the HUD [H]';
    if (minimized) closePopovers();
  });
  listen(window, 'keydown', event => {
    if (!city.isTypingInField(event)) setPromptDevice('keyboard');
    const current = owner();
    if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing
      || gameMenu.isOpen || !['riding', 'map'].includes(current) || city.isTypingInField(event)) return;
    if (!['Escape', 'KeyP'].includes(event.code) || current === 'map' && event.code === 'Escape') return;
    if (event.code === 'Escape' && supportsPopover && popovers.some(pop => pop.matches(':popover-open'))) return;
    if (current === 'map') mapSystem.toggleFullMap(false);
    event.preventDefault(); event.stopImmediatePropagation(); gameMenu.openPause();
  }, true);
  listen(window, 'keydown', event => {
    if (owner() !== 'riding' || event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey
      || event.isComposing || city.isTypingInField(event) || event.target?.closest?.('button, a[href], [role="button"], [contenteditable]')) return;
    if (event.code === 'KeyC') gameMenu.openPicker();
    else if (event.code === 'Digit1' || event.code === 'Digit2') gameMenu.openPicker(PLAYABLE_RIDERS[Number(event.code.slice(5)) - 1]);
    else if (event.code === 'KeyV') cycleCamera(event.shiftKey ? -1 : 1);
    else if (event.code === 'KeyH') hudToggle.click();
    else if (event.code === 'KeyN') audioSystem.setEnabled(!audioSystem.enabled);
    else {
      const id = { Digit5: 'chase', Digit6: 'action', Digit7: 'pov', Digit8: 'fifthAve', Digit9: 'timesSquare', Digit0: 'chryslerGCT' }[event.code];
      if (id) selectCamera(id, true);
    }
  });
  listen(window, 'pointerdown', event => setPromptDevice(event.pointerType === 'touch' ? 'touch' : 'keyboard'), true);
  listen(window, 'pointermove', event => { if (event.pointerType === 'mouse' && mapSystem.isFullMapOpen) setPromptDevice('keyboard'); }, { passive: true });
  for (const type of ['pointerdown', 'wheel']) listen(renderer.domElement, type, event => {
    if (owner() !== 'riding') { event.preventDefault(); event.stopImmediatePropagation(); return; }
    if (type === 'pointerdown') container.focus({ preventScroll: true });
  }, { capture: true, passive: false });
  const suspendPage = () => {
    savePlayerState(); riderSelection.cancel(); titleScreen.cancelPreparation(); syncLifecycle(); resetFrameClock();
  };
  listen(document.getElementById('title-main-menu'), 'click', () => { pageAway = true; suspendPage(); });
  listen(window, 'pagehide', () => { pageAway = true; suspendPage(); });
  listen(window, 'pageshow', () => { pageAway = false; gameMenu.leaving = false; gameMenu.reset(); syncLifecycle(); resetFrameClock(); scheduleViewportResize(); });
  listen(document, 'visibilitychange', () => { if (document.hidden) suspendPage(); else { syncLifecycle(); resetFrameClock(); } });
  for (const type of ['blur', 'focus']) listen(window, type, () => {
    windowFocused = type === 'focus';
    controllerManager.resetInput(); touchControls.reset(); gamepadControls.reset(); cameraSystem._clearPointers();
    mapSystem.cancelGestures(); syncLifecycle(); resetFrameClock();
  });

  let resizePending = false;
  function applyViewportSize() {
    resizePending = false;
    if (startup.failed || stopped || rendererBusy) return;
    const width = container.clientWidth, height = container.clientHeight;
    if (!(width > 0 && height > 0)) return;
    const hostChanged = width !== renderWidth || height !== renderHeight, scale = resolutionPreference.scale;
    if (hostChanged) {
      controllerManager.resetInput(); touchControls.reset(); gamepadControls.reset(); cameraSystem.onResize(width, height); mapSystem.cancelGestures();
    }
    if (hostChanged || scale !== renderScale) {
      renderer.setDrawingBufferSize(width, height, drawingBufferRatio(width, height, scale));
      renderWidth = width; renderHeight = height; renderScale = scale; dirtyView = true;
    }
    document.documentElement.style.setProperty('--hud-content-top',
      `${Math.ceil(document.getElementById('hud-toolbar').getBoundingClientRect().bottom) + 12}px`);
    updateSoundButton();
    if (mapSystem.isFullMapOpen) { mapSystem.resizeFullCanvas(); mapSystem.renderFullMap(); }
  }
  function scheduleViewportResize() { if (!resizePending && !stopped) { resizePending = true; requestAnimationFrame(applyViewportSize); } }
  listen(window, 'resize', scheduleViewportResize);
  const observer = new ResizeObserver(scheduleViewportResize);
  observer.observe(container); observer.observe(document.getElementById('hud-toolbar'));
  ownedDisposals.push(() => observer.disconnect());
  scheduleViewportResize();
  document.body.dataset.mode = 'euc'; document.body.dataset.input = promptDevice;
  touchControls.setMode('euc'); touchControls.setEnabled(false);
  renderControlHints(); updateCommittedRider();
  selectCamera('chase', true, false); cameraSystem.setTitleOrbit(true); selectTime(viewPreferences.time, false);
  // Populate the retained city once without advancing its clocks. The title then freezes these
  // logical actor poses; shader warm-up sees the actual crowd/vehicle buffers, not uninitialized pools.
  cameraSystem.update(0, 0);
  trafficSystem.update(0, 0, cameraSystem.currentPos, controllerManager.getActiveEntity(), 'euc', cameraSystem.camera);
  highwayTraffic.update(0, cameraSystem.camera, controllerManager.getActiveEntity(), 'euc');
  transit.update(0);
  document.fonts?.ready.then(() => { if (!stopped) scheduleViewportResize(); });

  // Existing inspection API: ordinary runtime objects, no alternate simulation or test-only control path.
  window.__NYC_APP = { renderer, scene, renderPipeline, postFX: { scenePass, ssrPass, graphics,
      get bloomPass() { return graphics.current?.grade.bloomPass; }, get colorGrade() { return graphics.current?.grade; } },
    cityGrid, cityBlocks, quadtree: cityBlocks.quadtree, cullingStats, region, bridges, gradeSeparation, roadNetwork,
    trafficSystem, highwayTraffic, transit, controllerManager, cameraSystem, touchControls, gamepadControls,
    lightingSystem, mapSystem, audioSystem, titleScreen, gameMenu, riderSelection, dynamicWorld,
    selectCamera, cycleCamera, selectTime, getFps: () => currentFps, ready: false,
    debug: { heightAt: (x, z) => city.Terrain.heightAt(x, z), groundAt: (x, z) => city.Terrain.groundAt(x, z),
      teleport: (x, z, heading = 180) => teleportTo(x, z, heading * Math.PI / 180), setTime: selectTime,
      stats: () => ({ fps: currentFps, calls: renderer.info.render.drawCalls ?? renderer.info.render.calls,
        triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        terrain: cityGrid.terrain?.stats(), region: region.stats() }) } };

  let nemesisWarming = false;
  async function precompileShaders() {
    rendererBusy = true;
    const target = renderer.getRenderTarget(), previousMRT = renderer.getMRT(), culled = [];
    const temporary = bookingScene ? [[bookingScene.group, bookingScene.group.visible]] : [];
    let compiled = false;
    try {
      await stage('Preparing reflections and bloom…', 'effects');
      scene.visible = false;
      try { renderPipeline.render(); } finally { scene.visible = true; }
      const player = controllerManager.getActiveEntity();
      nemesisWarming = !!nemesis?.beginWarmup(player.position.x, player.position.y, player.position.z, player.heading);
      for (const [object] of temporary) object.visible = true;
      const jobs = [], byMaterial = new Map();
      scene.traverseVisible(object => {
        if (object.frustumCulled) { culled.push(object); object.frustumCulled = false; }
        if (!object.isMesh && !object.isLine && !object.isPoints && !object.isSprite) return;
        if (object.userData.sharesPipelineWith || object.userData.shadowProxy) return;
        if (object.isInstancedMesh || Array.isArray(object.material)) { jobs.push([object]); return; }
        let job = byMaterial.get(object.material);
        if (!job) { job = []; byMaterial.set(object.material, job); jobs.push(job); }
        job.push(object);
      });
      await stage(`Compiling scene shaders… 0 / ${jobs.length} batches`, 'compile', false);
      renderer.setRenderTarget(scenePass.renderTarget); renderer.setMRT(sceneMRT);
      let next = 0, done = 0;
      const worker = async () => {
        while (!startup.failed && next < jobs.length) {
          const job = jobs[next++];
          for (const object of job) {
            await nextTask(); if (startup.failed) return;
            await renderer.compileAsync(object, cameraSystem.camera, scene);
          }
          if (startup.failed) return;
          done++; loadingStatus.textContent = `Compiling scene shaders… ${done} / ${jobs.length} batches`;
          setStageProgress(done / Math.max(1, jobs.length));
        }
      };
      // Drain every native compiler even if a peer fails; no early attachment/geometry disposal.
      const results = await Promise.allSettled(Array.from({ length: 16 }, worker));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      compiled = true;
    } finally {
      if (!compiled && nemesisWarming) { nemesis.endWarmup(); nemesisWarming = false; }
      for (const [object, visible] of temporary) object.visible = visible;
      renderer.setMRT(previousMRT); renderer.setRenderTarget(target);
      for (const object of culled) object.frustumCulled = true;
      rendererBusy = false; scheduleViewportResize();
    }
  }
  startup.phase('shaders'); compileWork = precompileShaders(); await compileWork;
  if (startup.failed) return;
  startup.phase('first-frame'); await stage('Preparing shadows and the first frame…', 'firstFrame');
  renderStats = createRenderStats({ enabled: params.get('perf') === '1', renderer });
  if (renderStats) ownedDisposals.push(renderStats.dispose);
  lifecycleReady = true; syncLifecycle();

  function updateWorldView(viewTime) {
    bridges.update(cameraSystem.camera);
    region.update(cameraSystem.camera, viewTime, controllerManager.getActiveEntity().position);
    cityBlocks.update(cameraSystem.currentPos.x, cameraSystem.currentPos.z);
    streetDetails.update?.(cameraSystem.camera);
    lightingSystem.update(cameraSystem.currentPos, viewTime);
    cityGrid.terrain?.update(cameraSystem.camera.position, viewTime, controllerManager.getActiveEntity().position);
  }
  async function firstFrameComplete() {
    // A JS submission is insufficient. GPU rejection remains a startup failure.
    const device = renderer.backend.device;
    if (device) await device.queue.onSubmittedWorkDone();
    else {
      const gl = renderer.backend.gl;
      if (!gl || gl.isContextLost()) throw new Error('WebGL2 context was lost before the first frame completed.');
      gl.finish();
      if (gl.isContextLost()) throw new Error('WebGL2 context was lost while completing the first frame.');
    }
    if (startup.failed || stopped) return;
    titleScreen.show(); loadingOverlay.classList.add('hidden'); audioSystem.ready = true;
    setLoadingProgress(1); window.__NYC_APP.ready = true; startup.complete();
  }
  renderer.setAnimationLoop(now => {
    if (startup.failed || stopped) return;
    try {
      syncLifecycle();
      let current = owner();
      const rawDt = lastTime === null ? 0 : Math.max(0, (now - lastTime) / 1000); lastTime = now;
      let dt = Math.min(rawDt, 0.05);
      const ownerBeforeInput = current;
      if (current === 'menu') gameMenu.updateGamepad(dt);
      else if (current === 'title' && titleScreen.isOpen) titleScreen.update();
      else if (current === 'booking') bookingScreen.updateGamepad();
      else if (current === 'riding' || current === 'map') gamepadControls.update(dt);
      current = owner(); // a pad edge may change owner in this callback
      if (current !== ownerBeforeInput) dt = 0;
      renderStats?.setActive(current === 'riding' && !rendererBusy && windowFocused);
      if (current === 'hidden' || current === 'graphics' || rendererBusy) return;
      let riding = current === 'riding';
      const title = current === 'title';
      const entity = controllerManager.getActiveEntity();
      if (riding) {
        elapsed += dt;
        if (streetDetails.signalClock) streetDetails.signalClock.value = elapsed;
        // Final logical actor poses reach native admission; city systems never push the rider mesh.
        trafficSystem.update(dt, elapsed, cameraSystem.currentPos, entity, 'euc', cameraSystem.camera);
        // Keep the exclusion through any old-camera frame; the first destination-focused
        // recycling pass is protected even when Skip releases directly from a remote district.
        retireBookingSpawnProtection(entity);
        highwayTraffic.update(dt, cameraSystem.camera, entity, 'euc'); transit.update(dt);
        controllerManager.update(dt, elapsed);
      } else entity.update(0, controllerManager.keys);
      if (title) titleElapsed += dt;
      const viewTime = title ? titleElapsed : elapsed;
      if (riding || title || !warmedUp) cameraSystem.update(dt, viewTime);
      // The officer sees the final camera and player pose. A capture owns input and
      // persistence in this same callback, before any periodic save or render.
      if (nemesis && !booking.active) {
        const result = nemesis.update(dt, riding);
        if (result.captured) {
          startBooking(); current = owner(); riding = false; dt = 0;
        }
      }
      if (current === 'booking') {
        const bookingDt = bookingSuspended ? 0 : dt;
        if (bookingDt > 0) {
          elapsed += bookingDt;
          if (streetDetails.signalClock) streetDetails.signalClock.value = elapsed;
          trafficSystem.update(bookingDt, elapsed, cameraSystem.currentPos, entity, 'euc', cameraSystem.camera);
          bookingClearancePending = false;
          highwayTraffic.update(bookingDt, cameraSystem.camera, controllerManager.getActiveEntity(), 'euc');
          transit.update(bookingDt);
        }
        if (booking.update(bookingDt) === 'transfer') {
          if (bookingScreen.transfer()) {
            cameraSystem.resetForTeleport();
            // Traffic's draw buffers were packed before the stage clearance existed. Wait for
            // the next normal actor update before submitting the first staged view.
            bookingClearancePending = true;
            dirtyView = true;
          }
          else document.querySelector('#booking-overlay .booking-subtitle').textContent = 'Intake occupied. Retrying…';
        }
        const view = bookingScene.update(bookingDt, booking.state, cameraSystem.camera.aspect);
        if (view) { cameraSystem.setCinematic(view); cameraSystem.update(bookingDt, elapsed); }
        bookingScreen.update(booking.state);
      }
      mapSystem.update(); audioSystem.update(dt, elapsed, cameraSystem.camera, lightingSystem.activePresetId === 'midnight');
      eucHud.update(entity.controller, elapsed, promptDevice, entity.tricks?.label ?? ''); touchControls.setDown(entity.controller.crashed);
      if (nemesis) chaseHud.update(nemesis.hudView);
      if (riding && now >= nextPlayerSave) { savePlayerState(); nextPlayerSave = now + 5000; }
      const renderFrame = !bookingClearancePending && ((riding || title || current === 'booking')
        && framePacer.shouldRender(now) || dirtyView || !warmedUp);
      if (renderFrame) {
        graphics.apply(graphicsPreference.value);
        dirtyView = false; entity.prepareView?.(now); updateWorldView(elapsed);
        if (warmedUp) city.updateSceneCulling(cameraSystem.camera.position);
        if (!warmedUp) {
          const culled = [];
          scene.traverse(object => { if (object.frustumCulled && !object.userData.sharesPipelineWith) { culled.push(object); object.frustumCulled = false; } });
          try { renderPipeline.render(); } finally {
            for (const object of culled) object.frustumCulled = true;
            if (nemesisWarming) { nemesis.endWarmup(); nemesisWarming = false; }
          }
        }
        renderPipeline.render();
        renderStats?.submitted(now, riding);
        frameCount++;
        graphicsLimit.dataset.quality = graphics.value;
        graphicsLimit.removeAttribute('aria-busy');
        if (!warmedUp) {
          warmedUp = true; beginStage('Waiting for graphics to finish the first frame…', 'gpu');
          firstFrameWork = firstFrameComplete();
          firstFrameWork.catch(graphicsFailed);
        }
      }
      fpsTimer += rawDt;
      if (fpsTimer >= 0.25) {
        currentFps = Math.round(frameCount / fpsTimer); frameCount = fpsTimer = 0;
        const fps = document.getElementById('hud-fps'); fps.textContent = String(currentFps); fps.className = frameRateHealth(currentFps, frameRatePreference.value);
        document.getElementById('hud-speed').textContent = formatSpeed(entity.speed, 'mph');
        document.getElementById('hud-speed-kmh').textContent = formatSpeed(entity.speed, 'kmh');
        document.getElementById('hud-speed-meter').style.transform = `scaleX(${Math.min(1, Math.abs(entity.speed) / Math.max(9, entity.controller.derivedTopSpeed))})`;
        document.body.classList.toggle('is-overspeed', entity.controller.overspeed > 0 && !entity.controller.crashed);
        renderLocation(city.getLocationLabel(entity.position.x, entity.position.z));
      }
    } catch (error) { graphicsFailed(error); }
  });
}
