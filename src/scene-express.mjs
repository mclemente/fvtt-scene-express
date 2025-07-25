const RE_TO_SPACE = /[_+]/g;

Hooks.once("init", () => {
  game.settings.register("scene-express", "folderPath", {
    name: "SCENE_EXPRESS.FOLDER_PATH",
    hint: "SCENE_EXPRESS.FOLDER_PATH_HINT",
    scope: "world",
    config: true,
    type: String,
    default: `worlds/${game.world.id}/scenes/`,
    filePicker: "folder"
  });
  game.settings.register("scene-express", "fileExistsBehavior", {
    name: "SCENE_EXPRESS.FILE_EXISTS_BEHAVIOR",
    hint: "SCENE_EXPRESS.FILE_EXISTS_BEHAVIOR_HINT",
    scope: "world",
    config: true,
    type: Number,
    choices: {
      1: "SCENE_EXPRESS.FILE_EXISTS_BEHAVIOR_1",
      2: "SCENE_EXPRESS.FILE_EXISTS_BEHAVIOR_2",
      3: "SCENE_EXPRESS.FILE_EXISTS_BEHAVIOR_3"
    },
    default: 1
  });

  game.settings.register("scene-express", "activate", {
    name: "SCENE_EXPRESS.IMMEDIATELY_ACTIVE",
    hint: "SCENE_EXPRESS.IMMEDIATELY_ACTIVE_HINT",
    scope: "world",
    config: true,
    type: Boolean,
    default: "false"
  });
});

Hooks.once("setup", async () => {
  if (!game.user.isGM) return;

  try {
    const folderPath = game.settings.get("scene-express", "folderPath");
    if (folderPath === `worlds/${game.world.id}/scenes/`) {
      await foundry.applications.apps.FilePicker.implementation.createDirectory("data", folderPath);
    }
  } catch (err) {
    if (!err.message.startsWith("EEXIST:")) {
      throw err;
    }
  }
  Hooks.once("ready", async () => {
    game.scene_express_drop = await new foundry.applications.ux.DragDrop.implementation({
      callbacks: {
        drop: handleDrop
      }
    });
  });

  Hooks.on("activateAbstractSidebarTab", onRenderSidebarTab);
});

const handleFile = async (file) => {
  if (!Object.values(CONST.IMAGE_FILE_EXTENSIONS).includes(file.type)) {
    ui.notifications.error(game.i18n.format("SCENE_EXPRESS.UNHANDLED_IMAGE", { fileName: file.name }), {
      permanent: true
    });
    return {};
  }

  const fp = foundry.applications.apps.FilePicker.implementation;

  const fileExistsBehavior = game.settings.get("scene-express", "fileExistsBehavior");

  const futur_scene_name = file.name.split(".")[0].replace(RE_TO_SPACE, " ");
  let scene = game.scenes.find((scene) => scene.name === futur_scene_name);
  if (scene && fileExistsBehavior === 1) {
    ui.notifications.error(game.i18n.format("SCENE_EXPRESS.SCENE_EXISTS", { sceneName: futur_scene_name }), {
      permanent: true
    });
    return {};
  }

  const scenesLocation = game.settings.get("scene-express", "folderPath");

  const browser = await fp.browse("data", scenesLocation);
  if (browser.files.includes(scenesLocation + file.name) && fileExistsBehavior === 1) {
    ui.notifications.error(game.i18n.format("SCENE_EXPRESS.FILE_EXISTS", { fileName: file.name }), {
      permanent: true
    });
    return {};
  } else if (browser.files.includes(scenesLocation + file.name) && fileExistsBehavior === 2) {
    return {
      file: file,
      path: scenesLocation + file.name
    };
  } else if (!browser.files.includes(scenesLocation + file.name) || fileExistsBehavior === 3) {
    const response = await fp.upload("data", scenesLocation, file);
    return {
      file: file,
      path: response.path
    };
  }
  return {};
};

const createScene = async (savedFile, active = false) => {
  if (!Object.keys(savedFile).length) return;

  const fileExistsBehavior = game.settings.get("scene-express", "fileExistsBehavior");

  const scene_name = savedFile.file.name.split(".")[0].replace(RE_TO_SPACE, " ");
  let scene = game.scenes.find((scene) => scene.name === scene_name);
  if (scene && fileExistsBehavior === 1) {
    ui.notifications.error(game.i18n.format("SCENE_EXPRESS.SCENE_EXISTS", { sceneName: scene_name }), {
      permanent: true
    });
    return;
  }

  const img = new Image();
  img.src = savedFile.path;
  img.onload = async () => {
    const sceneData = {
      name: scene_name,
      active: false,
      navigation: true,
      background: {
        src: savedFile.path
      },
      padding: 0,
      backgroundColor: "#000000",
      grid: { type: 0 },
      tokenVision: true,
      fogExploration: false,
      width: img.width || 4000,
      height: img.height || 3000
    };

    if (scene && fileExistsBehavior >= 2) {
      await scene.update(sceneData);
    } else if (!scene) {
      scene = await getDocumentClass("Scene").create({ ...sceneData, active });
    }
    const data = await scene.createThumbnail();
    await scene.update({ thumb: data.thumb }, { diff: false });
  };
};

const handleDrop = async (event) => {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove("dragover");

  const active = event.dataTransfer.files.length === 1 && game.settings.get("scene-express", "activate");
  const savedFiles = await Promise.all(Array.from(event.dataTransfer.files).map(handleFile));
  for (const savedFile of savedFiles) {
    await createScene(savedFile, active);
  }
};

const onRenderSidebarTab = async (tab) => {
  const { element, id } = tab;
  // Exit early if necessary;
  if (id !== "scenes") return;
  if (element.querySelector("#scene-express-dropzone")) return;

  const footer = element.querySelector(".directory-footer");
  const content = await foundry.applications.handlebars.renderTemplate("modules/scene-express/templates/dropzone.html");
  footer.insertAdjacentHTML("beforebegin", content);
  const dropzone = element.querySelector("#scene-express-dropzone");
  game.scene_express_drop.bind(dropzone);
  dropzone.addEventListener("dragenter", (ev) => dropzone.classList.add("dragover"));
  dropzone.addEventListener("dragleave", (ev) => dropzone.classList.remove("dragover"));
};
