/* GLOBAL CONSTANTS AND VARIABLES */

/* assignment specific globals */
const INPUT_TRIANGLES_URL = "https://ncsucgclass.github.io/prog3/triangles.json"; // triangles file loc
var defaultEye = vec3.fromValues(0.6479,0.5,-1.45); // default eye position in world space
var defaultCenter = vec3.fromValues(0.58446,0.5,0.50662); // default view direction in world space
var defaultUp = vec3.fromValues(0,1,0); // default view up vector
var lightAmbient = vec3.fromValues(1,1,1); // default light ambient emission
var lightDiffuse = vec3.fromValues(1,1,1); // default light diffuse emission
var lightSpecular = vec3.fromValues(1,1,1); // default light specular emission
var lightPosition = vec3.fromValues(-0.5,1.5,-0.5); // default light position
var rotateTheta = Math.PI/50; // how much to rotate models by with each key press
var pMatrix = mat4.perspective(mat4.create(),0.3*Math.PI,1,0.1,10); // projection matrix

/* webgl and geometry data */
var gl = null; // the all powerful gl object. It's all here folks!
var allModels = []; // the triangle data as loaded from input files
var numEntities = 0; // how many triangle sets in input scene
var vertexBuffers = []; // this contains vertex coordinate lists by set, in triples
var normalBuffers = []; // this contains normal component lists by set, in triples
var texCoordsBuffers = [];
var textureBuffer;
var triSetSizes = []; // this contains the size of each triangle set
var triangleBuffers = []; // lists of indices into vertexBuffers by set, in triples
var viewDelta = 0; // how much to displace view with each key press

/* shader parameter locations */
var vPosAttribLoc; // where to put position for vertex shader
var pvMatrixULoc; // where to put project model view matrix for vertex shader
var ambientULoc; // where to put ambient reflecivity for fragment shader
var diffuseULoc; // where to put diffuse reflecivity for fragment shader
var specularULoc; // where to put specular reflecivity for fragment shader
var shininessULoc; // where to put specular exponent for fragment shader
var texCoordsLocation;
var textureLocation;
var useTexture;

/* interaction variables */
var Eye = vec3.clone(defaultEye); // eye position in world space
var Center = vec3.clone(defaultCenter); // view direction in world space
var Up = vec3.clone(defaultUp); // view up vector in world space

var programState = {
    makeItYourOwnEnabled: 0,
    allowFire: true,
    allowPlayer: true,
    enemyGroup: null,
    player: null,
    activeProjectiles: new Set(),
    collisionObjectIndex: null,
    spriteSheet: {
      location: "https://akarsh16reddy.github.io/CG-Prog-5-Images/galaxian_sprite.jpg",
      imageObject: null,
      dimensions: [218, 201],
      enemy: {
        basic: {
          original: [
            [0.00459,0.00498],[0.07339,0.00498],[0.07339,0.0796],[0.00459,0.0796]
          ],
          alternate: [
            [0.08257,0.99502],[0.15138,0.99502],[0.15138,0.92040],[0.08257,0.92040]
          ]
        },
        intermediate: {
          original: [
            [0.00459,0.08955],[0.07339,0.08955],[0.07339,0.16418],[0.00459,0.16418]
          ],
          alternate: [
            [0.08257,0.91045],[0.15138,0.91045],[0.15138,0.83582],[0.08257,0.83582]
          ]
        },
        advanced: {
          original: [
            [0.00459,0.25871],[0.07339,0.25871],[0.07339,0.33333],[0.00459,0.33333]
          ],
          alternate: [
            [0.08257,0.74129],[0.15138,0.74129],[0.15138,0.66667],[0.08257,0.66667]
          ]
        }
      },
      player: [
        [0.00459,0.34826],[0.07339,0.34826],[0.07339,0.42289],[0.00459,0.42289]
      ],
      explosion: [
        [0.51376,0.34826],[0.58257,0.34826],[0.58257,0.42289],[0.51376,0.42289]
      ],
      bullet: {
        player: [
          [0.302, 0.975], [0.302, 0.975], [0.302, 0.985], [0.302, 0.985]
        ],
        enemy: [
          [0.591, 0.975], [0.591, 0.975], [0.591, 0.985], [0.591, 0.985]
        ]
      },
      empty: [
        [0.93, 0.875], [0.99, 0.875], [0.99, 0.94], [0.93, 0.94]
      ]
    }
};

/* Constants */
const AttackMode = Object.freeze({
    ATTACKING: 'ATTACKING',
    RESERVE: 'RESERVE',
});

const EnemyType = Object.freeze({
    BASIC: 'BASIC',
    INTERMEDIATE: 'INTERMEDIATE',
    ADVANCED: 'ADVANCED'
});

const MoveDirection = Object.freeze({
    LEFT: 'LEFT',
    RIGHT: 'RIGHT'
})

/* Game classes */
class Projectile {
    #backup = null;

    constructor(projectileGeometry, parentRef) {
      projectileGeometry["belongsTo"] = this;
      this.parentRef = parentRef;
      this.geometry = projectileGeometry;
      this.grandParentTranslation = parentRef.parentTranslation;
      this.parentTranslation = parentRef.translation
      this.translation = vec3.create();
      this.fromPlayer = parentRef instanceof Player;
      this.firedAt = null;
      this.#backup = {
        parentTranslation: parentRef.translation,
        grandParentTranslation: parentRef.parentTranslation
      }
    }

    reset() {
      this.grandParentTranslation = this.parentRef.parentTranslation;
      this.parentTranslation = this.parentRef.translation;
      this.translation = vec3.create();
      this.firedAt = null;
      programState.activeProjectiles.delete(this)
    }

    fire(rafTimeStamp) {
      if(this.fromPlayer) {
        this.playerFire(rafTimeStamp)
      } else {
        this.enemyFire(rafTimeStamp)
      }
    }

    playerFire(rafTimeStamp) {
      if(this.firedAt == undefined || this.firedAt == null) {
        this.firedAt = rafTimeStamp;
        this.translation = vec3.copy(this.translation,this.parentTranslation);
        this.parentTranslation = null;
        this.grandParentTranslation = null;
      }
      
      if(this.translation[1] > 2.0) {
        programState.allowFire = true;
        this.reset()
      } else {
        this.translation[1] = (((rafTimeStamp - this.firedAt)/300))
      }

    }

    enemyFire(rafTimeStamp) {
      if(this.firedAt == undefined || this.firedAt == null) {
        this.firedAt = rafTimeStamp;
        const player = programState.player;
        this.translation = this.parentRef.translation;
        this.playerCenter = applyTranslationToCenter(player.geometry.center, player.translation);
        this.projectileCenter = applyTranslationToCenter(this.parentRef.geometry.center, this.translation);
        console.log(this.projectileCenter)
        this.parentTranslation = null;
        this.grandParentTranslation = null;
      }
      
      if(rafTimeStamp - this.firedAt > 4000) {
        this.playerCenter = null;
        this.projectileCenter = null;
        this.reset()
      } else {
        this.translation[1] -= (rafTimeStamp - this.firedAt)/40000;
        this.translation[0] = getProjectileTranslation(this.projectileCenter, this.playerCenter, 4000, rafTimeStamp - this.firedAt)[0]
      }
    }
}

class Enemy {
    constructor(type, parentRef, geometry, row, column, projectileGeometry) {
        this.type = type
        this.attackMode = AttackMode.RESERVE
        this.parentRef = parentRef
        this.parentTranslation = parentRef.translation
        this.boundingBox = null
        this.onEdge = null
        geometry["belongsTo"] = this;
        this.geometry = geometry;
        this.rotationMatrix = mat4.create() 
        this.translation = vec3.create();
        this.movementStart = null;
        this.movement = null;
        this.row = row;
        this.column = column;
        this.alive = true;
        this.projectiles = [];
        for(let i = 0; i < 3; i++) {
          this.projectiles[i] = new Projectile(projectileGeometry[i], this);
        }
    }

    fireProjectile(index) {
      programState.activeProjectiles.add(this.projectiles[index]);

    }

    triggerEnemyMovement(rafTimeStamp) {
      if(this.movement == null) {
        const player = programState.player;
        this.movement = {};
        this.movement.playerCenter = applyTranslationToCenter(player.geometry.center, player.translation);
        this.translation = this.parentTranslation
        this.parentTranslation = null;
        this.movement.enemyCenter = applyTranslationToCenter(this.geometry.center, this.translation)
        this.movement.startTime = rafTimeStamp;
        this.movement.randomAmplitude = getRandomNumber(7, 9);
        for(let i = 0; i < 3; i++) {
          this.projectiles[i].grandParentTranslation = vec3.create();
        }
      } else if(rafTimeStamp  - this.movement.startTime > 7000) {
          this.translation = vec3.create();
          this.parentTranslation = this.parentRef.translation;
          this.parentRef.activeEnemy = null;
          this.movement = null;
          for(let i = 0; i < 3; i++) {
            if(!programState.activeProjectiles.has(this.projectiles[i])){
              this.projectiles[i].grandParentTranslation = this.parentTranslation;
              this.projectiles[i].parentTranslation = this.translation;
            }
          }
      } else {
        if(rafTimeStamp - this.movement.startTime > 1000) {
          if(rafTimeStamp - this.movement.startTime < 1200 && !programState.activeProjectiles.has(this.projectiles[0])) {
            this.fireProjectile(0);
          }
          if(rafTimeStamp - this.movement.startTime > 1600 && rafTimeStamp - this.movement.startTime < 2000 && !programState.activeProjectiles.has(this.projectiles[1])) {
            this.fireProjectile(1);
          }
          if(rafTimeStamp - this.movement.startTime > 2200 && rafTimeStamp - this.movement.startTime < 2500 && !programState.activeProjectiles.has(this.projectiles[2])) {
            this.fireProjectile(2);
          }
        }
        if(programState.makeItYourOwnEnabled) {
          this.translation = generateCircularAndDivingLeapTranslationVector(
                              this.movement.enemyCenter, 
                              this.movement.playerCenter, 
                              7000, 
                              rafTimeStamp - this.movement.startTime,
                            )
        } else {
          this.translation = generateSinusoidalTranslationVector(
            this.movement.enemyCenter, 
            this.movement.playerCenter, 
            7000, 
            rafTimeStamp - this.movement.startTime,
          )
        }
        for(let i = 0; i < 3; i++) {
          if(!programState.activeProjectiles.has(this.projectiles[i]))
            this.projectiles[i].parentTranslation = this.translation;
        }
      }
    }
}

class EnemyGroup {
    constructor() {
        this.enemyLimitInRow = 7
        this.enemies = [] // Array of Array of rows
        this.translation = vec3.create();
        this.movingDirection = MoveDirection.RIGHT;
        this.translationOffset = vec3.fromValues(0.05,0.0,0.0);
        this.lastTranslatedAt = null;
        this.useAlternateTexture = false;
        this.lastAlteredAt = null;
        this.activeEnemy = null;
        this.enemyActivatedAt = null;
        this.lastActivePickedFrom = MoveDirection.RIGHT;
        this.lastSelectedRow = 3;
        this.lastSelectedColumn = 0;
        this.lastActivatedAt = null;
    }

    alternateTextureWithTime(rafTimeStamp) {
      if(this.lastAlteredAt == null) {
        this.lastAlteredAt = rafTimeStamp;
        this.useAlternateTexture = true;
      } else {
        if(rafTimeStamp - this.lastAlteredAt > 750) {
          this.useAlternateTexture = !this.useAlternateTexture;
          this.lastAlteredAt = rafTimeStamp;
        }
      }
    } 
    
    translateWithTime(rafTimeStamp) {
      if(this.lastTranslatedAt == null) {
        this.lastTranslatedAt = rafTimeStamp;
      } 
      else {
        if(rafTimeStamp - this.lastTranslatedAt > 750){
        
          if(this.translation[0] > 0.20) {
            this.movingDirection = MoveDirection.RIGHT
          } else if(this.translation[0] < -0.20) {
            this.movingDirection = MoveDirection.LEFT
          }
          if(this.movingDirection == MoveDirection.LEFT) {
            vec3.add(this.translation, this.translation, this.translationOffset);
          } else {
            vec3.subtract(this.translation, this.translation, this.translationOffset);
          }
          this.lastTranslatedAt = rafTimeStamp;
        }
      }
    }

    activateRandomEnemy(rafTimeStamp) {
      if(!programState.allowPlayer) return;
      if(this.activeEnemy) {
        this.activeEnemy.triggerEnemyMovement(rafTimeStamp)
        this.lastActivatedAt = rafTimeStamp;
      } else {
        if(this.lastActivatedAt && rafTimeStamp - this.lastActivatedAt < 1500) {
          return;
        }
        if (this.lastActivePickedFrom == MoveDirection.RIGHT) {
          if(this.lastSelectedRow === -1) {
            this.lastSelectedColumn++;
            for(let i = 4; i >=0; i--) {
              if(this.enemies[i][this.lastSelectedColumn]){
                this.lastSelectedRow = i;
                break;
              }
            }
          }
          if(this.lastSelectedColumn > this.enemyLimitInRow) {
            this.lastSelectedColumn = 0;
            this.lastSelectedRow = 3
          }
          if(this.enemies[this.lastSelectedRow][this.lastSelectedColumn]) {
            this.activeEnemy = this.enemies[this.lastSelectedRow][this.lastSelectedColumn];
            this.enemies[this.lastSelectedRow][this.lastSelectedColumn].triggerEnemyMovement(rafTimeStamp);
            this.enemyActivatedAt = rafTimeStamp;
            this.lastSelectedRow--;
            this.lastActivePickedFrom = MoveDirection.RIGHT;
          } else {
            this.lastSelectedRow--
          }
        }
    }
  }
}

class Player {
    constructor(triangleData, projectileGeometry) {
        this.boundingBox = null;

        triangleData["belongsTo"] = this;
        this.geometry = triangleData;

        this.translation = vec3.create();
        this.translationOffset = vec3.fromValues(0.05,0.0,0.0);
        this.projectile = new Projectile(projectileGeometry, this);
    }

    translateLeft() {
      if(this.translation[0] < 0.60) {
        vec3.add(this.translation, this.translation, this.translationOffset);
      }
    }

    translateRight() {
      if(this.translation[0] > -0.60) {
        vec3.subtract(this.translation, this.translation, this.translationOffset);
      }
    }

    fireProjectile() {
      programState.activeProjectiles.add(this.projectile)
    }
}

// ASSIGNMENT HELPER FUNCTIONS

// does stuff when keys are pressed
function handleKeyDown(event) {
    
    const dirEnum = {NEGATIVE: -1, POSITIVE: 1}; // enumerated rotation direction

    function rotateModel(axis,direction) {
        if (handleKeyDown.modelOn != null) {
            var newRotation = mat4.create();

            mat4.fromRotation(newRotation,direction*rotateTheta,axis); // get a rotation matrix around passed axis
            vec3.transformMat4(handleKeyDown.modelOn.xAxis,handleKeyDown.modelOn.xAxis,newRotation); // rotate model x axis tip
            vec3.transformMat4(handleKeyDown.modelOn.yAxis,handleKeyDown.modelOn.yAxis,newRotation); // rotate model y axis tip
        } // end if there is a highlighted model
    } // end rotate model
    
    // set up needed view params
    var lookAt = vec3.create(), viewRight = vec3.create(), temp = vec3.create(); // lookat, right & temp vectors
    lookAt = vec3.normalize(lookAt,vec3.subtract(temp,Center,Eye)); // get lookat vector
    viewRight = vec3.normalize(viewRight,vec3.cross(temp,lookAt,Up)); // get view right vector
    
    function translatePlayer(moveDirection) {
      if(moveDirection === MoveDirection.LEFT) {
        programState.player.translateLeft();
      } else {
        programState.player.translateRight();
      }
    }

    function firePlayer() {
      programState.player.fireProjectile();
    }

    switch (event.code) {
        // model selection
        case "Space": 
            if(programState.allowFire && programState.allowPlayer) firePlayer();
            break;
        case "ArrowRight": // select next triangle set
            if(programState.allowPlayer)
              translatePlayer(MoveDirection.RIGHT);
            break;
        case "ArrowLeft": // select previous triangle set
            if(programState.allowPlayer)
              translatePlayer(MoveDirection.LEFT);
            break;
        // view change
        case "KeyA": // translate view left, rotate left with shift
            Center = vec3.add(Center,Center,vec3.scale(temp,viewRight,viewDelta));
            if (!event.getModifierState("Shift"))
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,viewRight,viewDelta));
            break;
        case "KeyD": // translate view right, rotate right with shift
            Center = vec3.add(Center,Center,vec3.scale(temp,viewRight,-viewDelta));
            if (!event.getModifierState("Shift"))
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,viewRight,-viewDelta));
            break;
        case "KeyS": // translate view backward, rotate up with shift
            if (event.getModifierState("Shift")) {
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,viewDelta));
                Up = vec3.cross(Up,viewRight,vec3.subtract(lookAt,Center,Eye)); /* global side effect */
            } else {
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,lookAt,-viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,lookAt,-viewDelta));
            } // end if shift not pressed
            break;
        case "KeyW": // translate view forward, rotate down with shift
            if (event.getModifierState("Shift")) {
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,-viewDelta));
                Up = vec3.cross(Up,viewRight,vec3.subtract(lookAt,Center,Eye)); /* global side effect */
            } else {
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,lookAt,viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,lookAt,viewDelta));
            } // end if shift not pressed
            break;
        case "KeyQ": // translate view up, rotate counterclockwise with shift
            if (event.getModifierState("Shift"))
                Up = vec3.normalize(Up,vec3.add(Up,Up,vec3.scale(temp,viewRight,-viewDelta)));
            else {
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,Up,viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,viewDelta));
            } // end if shift not pressed
            break;
        case "KeyE": // translate view down, rotate clockwise with shift
            if (event.getModifierState("Shift"))
                Up = vec3.normalize(Up,vec3.add(Up,Up,vec3.scale(temp,viewRight,viewDelta)));
            else {
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,Up,-viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,-viewDelta));
            } // end if shift not pressed
            break;
        case "Escape": // reset view to default
            Eye = vec3.copy(Eye,defaultEye);
            Center = vec3.copy(Center,defaultCenter);
            Up = vec3.copy(Up,defaultUp);
            break;
            
        // model transformation
        case "KeyK": // translate left, rotate left with shift
            if (event.getModifierState("Shift"))
                rotateModel(Up,dirEnum.NEGATIVE);
            else
                translateModel(vec3.scale(temp,viewRight,viewDelta));
            break;
        case "Semicolon": // translate right, rotate right with shift
            if (event.getModifierState("Shift"))
                rotateModel(Up,dirEnum.POSITIVE);
            else
                translateModel(vec3.scale(temp,viewRight,-viewDelta));
            break;
        case "KeyL": // translate backward, rotate up with shift
            if (event.getModifierState("Shift"))
                rotateModel(viewRight,dirEnum.POSITIVE);
            else
                translateModel(vec3.scale(temp,lookAt,-viewDelta));
            break;
        case "KeyO": // translate forward, rotate down with shift
            if (event.getModifierState("Shift"))
                rotateModel(viewRight,dirEnum.NEGATIVE);
            else
                translateModel(vec3.scale(temp,lookAt,viewDelta));
            break;
        case "KeyI": // translate up, rotate counterclockwise with shift 
            if (event.getModifierState("Shift"))
                rotateModel(lookAt,dirEnum.POSITIVE);
            else
                translateModel(vec3.scale(temp,Up,viewDelta));
            break;
        case "KeyP": // translate down, rotate clockwise with shift
            if (event.getModifierState("Shift"))
                rotateModel(lookAt,dirEnum.NEGATIVE);
            else
                translateModel(vec3.scale(temp,Up,-viewDelta));
            break;
        case "Digit1":
            if (event.getModifierState("Shift")){
              programState.makeItYourOwnEnabled = (programState.makeItYourOwnEnabled + 1) % 3
              if(programState.makeItYourOwnEnabled == 0) {
                Eye = vec3.clone(defaultEye); // eye position in world space
                Center = vec3.clone(defaultCenter); // view direction in world space
                Up = vec3.clone(defaultUp); // view up vector in world space
              }
              if(programState.makeItYourOwnEnabled == 1) {
                console.log("Enemy algorithm changed!");
                // Enemy algorithm change
              } else if(programState.makeItYourOwnEnabled == 2) {
                Eye = [0.6015229821205139, -0.7222169637680054, -0.79470294713974],
                Center = [0.5546989440917969,0.5274699926376343,0.7952618598937988],
                Up = vec3.normalize(Up,vec3.add(Up,Up,vec3.scale(temp,viewRight,viewDelta)));
              } 
            }
            break;
    } // end switch
} // end handleKeyDown

// set up the webGL environment
function setupWebGL() {
    
    // Set up keys
    document.onkeydown = handleKeyDown; // call this when key pressed


    var imageCanvas = document.getElementById("myImageCanvas"); // create a 2d canvas
      var cw = imageCanvas.width, ch = imageCanvas.height; 
      imageContext = imageCanvas.getContext("2d"); 
      var bkgdImage = new Image(); 
      bkgdImage.crossOrigin = "Anonymous";
      bkgdImage.src = "https://akarsh16reddy.github.io/CG-Prog-5-Images/galaxian_background.png";
      bkgdImage.onload = function(){
          var iw = bkgdImage.width, ih = bkgdImage.height;
          imageContext.drawImage(bkgdImage,0,0,iw,ih,0,0,cw,ch);   
     }

     
    // Get the canvas and context
    var canvas = document.getElementById("myWebGLCanvas"); // create a js canvas
    gl = canvas.getContext("webgl"); // get a webgl object from it
    
    try {
      if (gl == null) {
        throw "unable to create gl context -- is your browser gl ready?";
      } else {
        //gl.clearColor(0.0, 0.0, 0.0, 1.0); // use black when we clear the frame buffer
        gl.clearDepth(1.0); // use max when we clear the depth buffer
        gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
      }
    } // end try
    
    catch(e) {
      console.log(e);
    } // end catch
 
} // end setupWebGL

function generateCubeAt(startX, startY, startZ, length, width, height, leftSpacing = 0, alpha = 1.0, customUVs, alternateUVs) {
  const halfWidth = width / 2;
  const halfLength = length / 2;
  const halfHeight = height / 2;

  // Define the 8 vertices of the cube
  const vertices = [
    [leftSpacing + startX - halfWidth, startY - halfLength, startZ - halfHeight], // Bottom-front-left
    [leftSpacing + startX + halfWidth, startY - halfLength, startZ - halfHeight], // Bottom-front-right
    [leftSpacing + startX + halfWidth, startY + halfLength, startZ - halfHeight], // Top-front-right
    [leftSpacing + startX - halfWidth, startY + halfLength, startZ - halfHeight], // Top-front-left
    [leftSpacing + startX - halfWidth, startY - halfLength, startZ + halfHeight], // Bottom-back-left
    [leftSpacing + startX + halfWidth, startY - halfLength, startZ + halfHeight], // Bottom-back-right
    [leftSpacing + startX + halfWidth, startY + halfLength, startZ + halfHeight], // Top-back-right
    [leftSpacing + startX - halfWidth, startY + halfLength, startZ + halfHeight], // Top-back-left
  ];

  // Define the 12 triangles (6 faces, 2 triangles each)
  const triangles = [
    // Front face
    [0, 1, 2],
    [0, 2, 3],
    // Back face
    [4, 5, 6],
    [4, 6, 7],
    // Left face
    [0, 3, 7],
    [0, 7, 4],
    // Right face
    [1, 5, 6],
    [1, 6, 2],
    // Top face
    [3, 2, 6],
    [3, 6, 7],
    // Bottom face
    [0, 4, 5],
    [0, 5, 1],
  ];

  // Normals for each face
  const normals = [
    [0, 0, -1], // Front
    [0, 0, 1],  // Back
    [-1, 0, 0], // Left
    [1, 0, 0],  // Right
    [0, 1, 0],  // Top
    [0, -1, 0], // Bottom
  ];

  // UV coordinates for mapping textures on each face
  const default_uvs = [
    [0, 0], [1, 0], [1, 1], [0, 1], // UV mapping for one face
  ];

  let uvs = [
    ...default_uvs,
    ...default_uvs
  ]

  let alternate = [
    ...default_uvs,
    ...default_uvs
  ]

  if(customUVs) {
    uvs = [
      customUVs[3],
      customUVs[2],
      customUVs[1],
      customUVs[0],
      customUVs[3],
      customUVs[2],
      customUVs[1],
      customUVs[0],
    ]

    alternate = [
      customUVs[3],
      customUVs[2],
      customUVs[1],
      customUVs[0],
      customUVs[3],
      customUVs[2],
      customUVs[1],
      customUVs[0],
    ]
  }

  if(alternateUVs) {
    alternate = [
      alternateUVs[3],
      alternateUVs[2],
      alternateUVs[1],
      alternateUVs[0],
      alternateUVs[3],
      alternateUVs[2],
      alternateUVs[1],
      alternateUVs[0],
    ]
  }


  // Compute bounding box
  const minX = leftSpacing + startX - halfWidth;
  const minY = startY - halfLength;
  const minZ = startZ - halfHeight;

  const maxX = leftSpacing + startX + halfWidth;
  const maxY = startY + halfLength;
  const maxZ = startZ + halfHeight;

  // Return the cube data
  return {
    "material": {
      "ambient": [0.1, 0.1, 0.1],
      "diffuse": [0.6, 0.4, 0.4],
      "specular": [0.3, 0.3, 0.3],
      "n": 11,
      "alpha": alpha
    },
    "normals": [
      ...normals, // Repeat normals for each face
      ...normals,
    ],
    "uvs": uvs,
    "alternateUVs": alternate,
    "vertices": vertices,
    "triangles": triangles,
    "boundingBox": {
      "min": [minX, minY, minZ],
      "max": [maxX, maxY, maxZ],
    },
  };
}

function checkCollisionWithVec33D(box1, mat4Translation1, box2, translation2) {
  // Extract the translation component from the 4x4 transformation matrix for box1
  const translation1 = [mat4Translation1[12], mat4Translation1[13], mat4Translation1[14]]; // tx, ty, tz

  // Extract the translation component from the vec3 for box2
  const translation2Vec3 = [translation2[0], translation2[1], translation2[2]]; // tx, ty, tz

  // Compute the actual min and max positions of each bounding box
  const box1Min = [
    box1.min[0] + translation1[0],
    box1.min[1] + translation1[1],
    box1.min[2] + translation1[2],
  ];
  const box1Max = [
    box1.max[0] + translation1[0],
    box1.max[1] + translation1[1],
    box1.max[2] + translation1[2],
  ];
  const box2Min = [
    box2.min[0] + translation2Vec3[0],
    box2.min[1] + translation2Vec3[1],
    box2.min[2] + translation2Vec3[2],
  ];
  const box2Max = [
    box2.max[0] + translation2Vec3[0],
    box2.max[1] + translation2Vec3[1],
    box2.max[2] + translation2Vec3[2],
  ];

  // Check for overlap on each axis
  const overlapX = box1Min[0] <= box2Max[0] && box1Max[0] >= box2Min[0];
  const overlapY = box1Min[1] <= box2Max[1] && box1Max[1] >= box2Min[1];
  const overlapZ = box1Min[2] <= box2Max[2] && box1Max[2] >= box2Min[2];

  // If there is overlap on all three axes, the boxes collide
  return overlapX && overlapY && overlapZ;
}


function initEnemyGroup() {
  let enemyGroup = new EnemyGroup();

  // Populate enemies
  const enemiesInEachRow = enemyGroup.enemyLimitInRow;
  const enemyGeometry = []
  for(let i = 0; i < 5; i ++) {
      enemyGroup.enemies.push([]);
      for(let j = 0; j < enemiesInEachRow; j ++) {
          // TODO :: surround border with basic enemies I guess
          let enemyType = EnemyType.BASIC;
          let enemyUVs = programState.spriteSheet.enemy.basic.original;
          let altEnemyUVs = programState.spriteSheet.enemy.basic.alternate;
          if(i === 4) {
              enemyType = EnemyType.Advanced;
              enemyUVs = programState.spriteSheet.enemy.advanced.original;
              altEnemyUVs = programState.spriteSheet.enemy.advanced.alternate;
              if((j % 2 != 0) || (j == 0 || j == enemiesInEachRow-1)) {
                enemyGroup.enemies[i].push(null)
                continue;
              };
          } else if(i === 3 || i == 2) {
              enemyType = EnemyType.INTERMEDIATE;
              enemyUVs = programState.spriteSheet.enemy.intermediate.original;
              altEnemyUVs = programState.spriteSheet.enemy.intermediate.alternate;
          }
          geometry = generateCubeAt(j*0.1, 0.75 + i*0.15, 0.5, 0.1, 0.1, 0.1, 0.08 * j, 1.0, enemyUVs, altEnemyUVs);
          projectileGeometry = [
            generateCubeAt(j*0.1, 0.75 + i*0.15, 0.5, 0.06, 0.01, 0.01, 0.08 * j, 1.0, programState.spriteSheet.bullet.enemy),
            generateCubeAt(j*0.1, 0.75 + i*0.15, 0.5, 0.06, 0.01, 0.01, 0.08 * j, 1.0, programState.spriteSheet.bullet.enemy),
            generateCubeAt(j*0.1, 0.75 + i*0.15, 0.5, 0.06, 0.01, 0.01, 0.08 * j, 1.0, programState.spriteSheet.bullet.enemy)
          ];
          
          enemyGroup.enemies[i].push(new Enemy(enemyType, enemyGroup, geometry, i, j, projectileGeometry))
          enemyGeometry.push(geometry);
          enemyGeometry.push(...projectileGeometry);
      }
  }
  programState.enemyGroup = enemyGroup;
  return enemyGeometry;
}

function initPlayer() {
  playerGeometry = generateCubeAt(0.6, -0.3, 0.5, 0.1, 0.1, 0.1, leftSpacing = 0, alpha = 1.0, programState.spriteSheet.player);
  projectileGeometry = generateCubeAt(0.6, -0.3, 0.5, 0.06, 0.01, 0.01, 0, 1.0, programState.spriteSheet.bullet.player)
  let player = new Player(playerGeometry, projectileGeometry);
  programState.player = player;
  return [playerGeometry, projectileGeometry];
}


function searchAndNullifyModel(index) {
  for(let i = 0; i < allModels.length; i++) {
    if(allModels[i] && allModels[i].index == index) {
      allModels[i] = null;
      break;
    }
  }
}

// read models in, load them into webgl buffers
function loadModels(totalGeometry) {
    allModels = totalGeometry;
    try {
      var whichEntityVert; // index of vertex in current triangle set
      var whichEntityTri; // index of triangle in current triangle set
      var vtxToAdd; // vtx coords to add to the coord array
      var normToAdd; // vtx normal to add to the coord array
      var triToAdd; // tri indices to add to the index array
      var maxCorner = vec3.fromValues(Number.MIN_VALUE,Number.MIN_VALUE,Number.MIN_VALUE); // bbox corner
      var minCorner = vec3.fromValues(Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE); // other corner
  
      // process each triangle set to load webgl vertex and triangle buffers
      numEntities = allModels.length; // remember how many tri sets
      for (var whichEntity=0; whichEntity<numEntities; whichEntity++) { // for each tri set
          
          // set up hilighting, modeling translation and rotation
          allModels[whichEntity].center = vec3.fromValues(0,0,0);  // center point of tri set
          allModels[whichEntity].translation = vec3.fromValues(0,0,0); // no translation
          allModels[whichEntity].xAxis = vec3.fromValues(1,0,0); // model X axis
          allModels[whichEntity].yAxis = vec3.fromValues(0,1,0); // model Y axis 

          // set up the vertex and normal arrays, define model center and axes
          allModels[whichEntity].glVertices = []; // flat coord list for webgl
          allModels[whichEntity].glNormals = []; // flat normal list for webgl
          allModels[whichEntity].glTexCoords = [];
          allModels[whichEntity].glAltTexCoords = [];
          allModels[whichEntity].index = whichEntity;
          var numVerts = allModels[whichEntity].vertices.length; // num vertices in tri set
          for (whichEntityVert=0; whichEntityVert<numVerts; whichEntityVert++) { // verts in set
              vtxToAdd = allModels[whichEntity].vertices[whichEntityVert]; // get vertex to add
              normToAdd = allModels[whichEntity].normals[whichEntityVert]; // get normal to add
              texCoordsToAdd = allModels[whichEntity].uvs[whichEntityVert];
              altTexCoordsToAdd = allModels[whichEntity].alternateUVs[whichEntityVert];
              allModels[whichEntity].glVertices.push(vtxToAdd[0],vtxToAdd[1],vtxToAdd[2]); // put coords in set coord list
              allModels[whichEntity].glNormals.push(normToAdd[0],normToAdd[1],normToAdd[2]); // put normal in set coord list
              allModels[whichEntity].glTexCoords.push(texCoordsToAdd[0],texCoordsToAdd[1])
              allModels[whichEntity].glAltTexCoords.push(altTexCoordsToAdd[0],1-altTexCoordsToAdd[1])
              vec3.max(maxCorner,maxCorner,vtxToAdd); // update world bounding box corner maxima
              vec3.min(minCorner,minCorner,vtxToAdd); // update world bounding box corner minima
              vec3.add(allModels[whichEntity].center,allModels[whichEntity].center,vtxToAdd); // add to ctr sum
          } // end for vertices in set
          vec3.scale(allModels[whichEntity].center,allModels[whichEntity].center,1/numVerts); // avg ctr sum

          // send the vertex coords and normals to webGL
          vertexBuffers[whichEntity] = gl.createBuffer(); // init empty webgl set vertex coord buffer
          gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[whichEntity]); // activate that buffer
          gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(allModels[whichEntity].glVertices),gl.DYNAMIC_DRAW); // data in
          normalBuffers[whichEntity] = gl.createBuffer(); // init empty webgl set normal component buffer
          gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[whichEntity]); // activate that buffer
          gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(allModels[whichEntity].glNormals),gl.STATIC_DRAW); // data in
          texCoordsBuffers[whichEntity] = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, texCoordsBuffers[whichEntity]);
          gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(allModels[whichEntity].glTexCoords),gl.DYNAMIC_DRAW);

          // set up the triangle index array, adjusting indices across sets
          allModels[whichEntity].glTriangles = []; // flat index list for webgl
          triSetSizes[whichEntity] = allModels[whichEntity].triangles.length; // number of tris in this set
          for (whichEntityTri=0; whichEntityTri<triSetSizes[whichEntity]; whichEntityTri++) {
              triToAdd = allModels[whichEntity].triangles[whichEntityTri]; // get tri to add
              allModels[whichEntity].glTriangles.push(triToAdd[0],triToAdd[1],triToAdd[2]); // put indices in set list
          } // end for triangles in set

          // send the triangle indices to webGL
          triangleBuffers.push(gl.createBuffer()); // init empty triangle index buffer
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[whichEntity]); // activate that buffer
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(allModels[whichEntity].glTriangles),gl.STATIC_DRAW); // data in

      } // end for each triangle set 

      textureBuffer = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, textureBuffer);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,new Uint8Array([255, 0, 0, 255])); // Color hardcoded for texture as backup

      var temp = vec3.create();
      viewDelta = vec3.length(vec3.subtract(temp,maxCorner,minCorner)) / 100; // set global
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end load models

// setup the webGL shaders
function setupShaders() {
    
    // define vertex shader in essl using es6 template strings
    var vShaderCode = `
        attribute vec3 aVertexPosition; // vertex position
        attribute vec3 aVertexNormal; // vertex normal
        attribute vec2 aTexCoords;

        uniform mat4 upvMatrix; // the project view matrix
        
        varying vec3 vWorldPos; // interpolated world position of vertex
        varying vec3 vVertexNormal; // interpolated normal for frag shader
        varying vec2 vTexCoords;

        void main(void) {
            
            // vertex position
            vec4 vWorldPos4 = vec4(aVertexPosition, 1.0);
            vWorldPos = vec3(vWorldPos4.x,vWorldPos4.y,vWorldPos4.z);
            gl_Position = upvMatrix * vec4(aVertexPosition, 1.0);

            // vertex normal (assume no non-uniform scale)
            vec4 vWorldNormal4 = vec4(aVertexNormal, 0.0);
            vVertexNormal = normalize(vec3(vWorldNormal4.x,vWorldNormal4.y,vWorldNormal4.z)); 
            vTexCoords = aTexCoords;

        }
    `;
    
    // define fragment shader in essl using es6 template strings
    var fShaderCode = `
        precision mediump float; // set float to medium precision

        // eye location
        uniform vec3 uEyePosition; // the eye's position in world
        
        // light properties
        uniform vec3 uLightAmbient; // the light's ambient color
        uniform vec3 uLightDiffuse; // the light's diffuse color
        uniform vec3 uLightSpecular; // the light's specular color
        uniform vec3 uLightPosition; // the light's position
        
        // material properties
        uniform vec3 uAmbient; // the ambient reflectivity
        uniform vec3 uDiffuse; // the diffuse reflectivity
        uniform vec3 uSpecular; // the specular reflectivity
        uniform float uShininess; // the specular exponent
        
        uniform sampler2D uTexture;
        uniform int uUseTexture;

        // geometry properties
        varying vec3 vWorldPos; // world xyz of fragment
        varying vec3 vVertexNormal; // normal of fragment
        varying vec2 vTexCoords;
            
        void main(void) {
        
            // ambient term
            vec3 ambient = uAmbient*uLightAmbient; 
            
            // diffuse term
            vec3 normal = normalize(vVertexNormal); 
            vec3 light = normalize(uLightPosition - vWorldPos);
            float lambert = max(0.0,dot(normal,light));
            vec3 diffuse = uDiffuse*uLightDiffuse*lambert; // diffuse term
            
            // specular term
            vec3 eye = normalize(uEyePosition - vWorldPos);
            vec3 halfVec = normalize(light+eye);
            float highlight = pow(max(0.0,dot(normal,halfVec)),uShininess);
            vec3 specular = uSpecular*uLightSpecular*highlight; // specular term
            
            // combine to output color
            vec3 colorOut = ambient + diffuse + specular; // no specular yet
            if(uUseTexture == 1) {
                vec4 texColor = texture2D(uTexture, vTexCoords);
                gl_FragColor = texColor; 
            } else {
              gl_FragColor = vec4(1.0, 0, 0, 1.0); 
            }
        }
    `;
    
    try {
        var fShader = gl.createShader(gl.FRAGMENT_SHADER); // create frag shader
        gl.shaderSource(fShader,fShaderCode); // attach code to shader
        gl.compileShader(fShader); // compile the code for gpu execution

        var vShader = gl.createShader(gl.VERTEX_SHADER); // create vertex shader
        gl.shaderSource(vShader,vShaderCode); // attach code to shader
        gl.compileShader(vShader); // compile the code for gpu execution
            
        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) { // bad frag shader compile
            throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);  
            gl.deleteShader(fShader);
        } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) { // bad vertex shader compile
            throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);  
            gl.deleteShader(vShader);
        } else { // no compile errors
            var shaderProgram = gl.createProgram(); // create the single shader program
            gl.attachShader(shaderProgram, fShader); // put frag shader in program
            gl.attachShader(shaderProgram, vShader); // put vertex shader in program
            gl.linkProgram(shaderProgram); // link program into gl context

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { // bad program link
                throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
            } else { // no shader program link errors
                gl.useProgram(shaderProgram); // activate shader program (frag and vert)
                
                // locate and enable vertex attributes
                vPosAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexPosition"); // ptr to vertex pos attrib
                gl.enableVertexAttribArray(vPosAttribLoc); // connect attrib to array
                vNormAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexNormal"); // ptr to vertex normal attrib
                gl.enableVertexAttribArray(vNormAttribLoc); // connect attrib to array
                
                texCoordsLocation  = gl.getAttribLocation(shaderProgram, "aTexCoords");
                gl.enableVertexAttribArray(texCoordsLocation);
                textureLocation = gl.getUniformLocation(shaderProgram, "uTexture");
                useTexture = gl.getUniformLocation(shaderProgram, "uUseTexture");

                // locate vertex uniforms
                pvMatrixULoc = gl.getUniformLocation(shaderProgram, "upvMatrix"); // ptr to pvmmat
                
                // locate fragment uniforms
                var eyePositionULoc = gl.getUniformLocation(shaderProgram, "uEyePosition"); // ptr to eye position
                var lightAmbientULoc = gl.getUniformLocation(shaderProgram, "uLightAmbient"); // ptr to light ambient
                var lightDiffuseULoc = gl.getUniformLocation(shaderProgram, "uLightDiffuse"); // ptr to light diffuse
                var lightSpecularULoc = gl.getUniformLocation(shaderProgram, "uLightSpecular"); // ptr to light specular
                var lightPositionULoc = gl.getUniformLocation(shaderProgram, "uLightPosition"); // ptr to light position
                ambientULoc = gl.getUniformLocation(shaderProgram, "uAmbient"); // ptr to ambient
                diffuseULoc = gl.getUniformLocation(shaderProgram, "uDiffuse"); // ptr to diffuse
                specularULoc = gl.getUniformLocation(shaderProgram, "uSpecular"); // ptr to specular
                shininessULoc = gl.getUniformLocation(shaderProgram, "uShininess"); // ptr to shininess
                
                // pass global constants into fragment uniforms
                gl.uniform3fv(eyePositionULoc,Eye); // pass in the eye's position
                gl.uniform3fv(lightAmbientULoc,lightAmbient); // pass in the light's ambient emission
                gl.uniform3fv(lightDiffuseULoc,lightDiffuse); // pass in the light's diffuse emission
                gl.uniform3fv(lightSpecularULoc,lightSpecular); // pass in the light's specular emission
                gl.uniform3fv(lightPositionULoc,lightPosition); // pass in the light's position
            } // end if no shader program link errors
        } // end if no compile errors
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end setup shaders


function transformVerticesUsingModelMatrix(vertices, mMatrix) {
  const transformedVertices = [];
  for (let i = 0; i < vertices.length; i += 3) {
      // Create a vec4 for the vertex (homogeneous coordinates)
      const vertex = vec4.fromValues(vertices[i], vertices[i + 1], vertices[i + 2], 1.0);
  
      // Apply the model matrix
      const transformedVertex = vec4.create();
      vec4.transformMat4(transformedVertex, vertex, mMatrix);
  
      // Push the transformed vertex (x, y, z) back to the array
      transformedVertices.push(
          transformedVertex[0], // x
          transformedVertex[1], // y
          transformedVertex[2]  // z
      );
  }
  return transformedVertices;
}

// Get Model Matrix for the entity
function getModelMatrixForEntity(currEntity) {
  const mMatrix = mat4.create();
  currEntityInstance = currEntity.belongsTo;
  var zAxis = vec3.create(), sumRotation = mat4.create(), temp = mat4.create(), negCtr = vec3.create();
  
  // move the model to the origin
  mat4.fromTranslation(mMatrix,vec3.negate(negCtr,currEntity.center)); // T(-ctr)
  
  // rotate the model to current interactive orientation
  vec3.normalize(zAxis,vec3.cross(zAxis,currEntity.xAxis,currEntity.yAxis)); // get the new model z axis
  mat4.set(sumRotation, // get the composite rotation
    currEntity.xAxis[0], currEntity.yAxis[0], zAxis[0], 0,
    currEntity.xAxis[1], currEntity.yAxis[1], zAxis[1], 0,
    currEntity.xAxis[2], currEntity.yAxis[2], zAxis[2], 0,
    0, 0,  0, 1);
    mat4.multiply(mMatrix,sumRotation,mMatrix); // R(ax) * T(-ctr)
    
    // translate back to model center
    mat4.multiply(mMatrix,mat4.fromTranslation(temp,currEntity.center),mMatrix); // T(ctr) * R(ax) * T(-ctr)
    
    // translate model to current interactive orientation
    mat4.multiply(mMatrix,mat4.fromTranslation(temp,currEntity.translation),mMatrix); // T(pos)*T(ctr)*R(ax)*T(-ctr)
    mat4.multiply(mMatrix,mat4.fromTranslation(temp,currEntityInstance.translation),mMatrix); // T(pos)*T(ctr)*R(ax)*T(-ctr)
    
    if(currEntityInstance.parentTranslation) {
      const parentTranslationMatrix = mat4.create();
      mat4.fromTranslation(parentTranslationMatrix, currEntityInstance.parentTranslation);
      mat4.multiply(mMatrix,parentTranslationMatrix,mMatrix); // T(pos)*T(ctr)*R(ax)*T(-ctr)
    }

    if(currEntityInstance.grandParentTranslation) {
      const parentTranslationMatrix = mat4.create();
      mat4.fromTranslation(parentTranslationMatrix, currEntityInstance.grandParentTranslation);
      mat4.multiply(mMatrix,parentTranslationMatrix,mMatrix); // T(pos)*T(ctr)*R(ax)*T(-ctr)
    }
    return mMatrix;
} // end make model transform



// render the loaded model
function renderModels(rafTimeStamp=0) {

    /* GL - clear screen & creating view & projection matrices */
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers
    var vMatrix = mat4.create(); // view matrix
    var pvMatrix = mat4.create(); // hand * proj * view matrices
    mat4.lookAt(vMatrix,Eye,Center,Up); // create view matrix
    mat4.multiply(pvMatrix,pvMatrix,pMatrix); // projection
    mat4.multiply(pvMatrix,pvMatrix,vMatrix); // projection * view
    /* GL - clear screen & creating view & projection matrices - END */

    const enemyGroupRef = programState.enemyGroup;
    enemyGroupRef.translateWithTime(rafTimeStamp);
    enemyGroupRef.alternateTextureWithTime(rafTimeStamp);
    enemyGroupRef.activateRandomEnemy(rafTimeStamp);

    for(const projectile of programState.activeProjectiles) {
      projectile.fire(rafTimeStamp);
    };
  
    window.requestAnimationFrame(renderModels); // set up frame render callback

    // render each triangle set
    var currEntity; // the tri set and its material properties
    for (var whichEntity=0; whichEntity<allModels.length; whichEntity++) {
        currEntity = allModels[whichEntity];
        if(currEntity == null) continue;

        const mMatrix = getModelMatrixForEntity(currEntity) // model matrix
        const newVertices = transformVerticesUsingModelMatrix(currEntity.glVertices, mMatrix);

        if(currEntity.belongsTo instanceof Player && enemyGroupRef.activeEnemy && programState.allowPlayer && enemyGroupRef.activeEnemy.alive &&
          checkCollisionWithVec33D(currEntity.boundingBox, mMatrix, enemyGroupRef.activeEnemy.geometry.boundingBox, enemyGroupRef.activeEnemy.translation) 
        ) {
          let [row, column] = [ enemyGroupRef.activeEnemy.row,  enemyGroupRef.activeEnemy.column];
          searchAndNullifyModel(enemyGroupRef.activeEnemy.geometry.index);
          for(let i = 0; i < 3; i ++) {
            searchAndNullifyModel(enemyGroupRef.activeEnemy.projectiles[i].geometry.index);
          }
          enemyGroupRef.enemies[row][column] = null;
          programState.collisionObjectIndex = whichEntity;
          enemyGroupRef.activeEnemy = null;
          programState.allowPlayer = false;
        }

        for(const projectile of programState.activeProjectiles) {
          if(!(currEntity.belongsTo instanceof Player) &&
             !(currEntity.belongsTo instanceof Projectile) &&
             (projectile.fromPlayer == true) &&
            checkCollisionWithVec33D(currEntity.boundingBox, mMatrix, projectile.geometry.boundingBox, projectile.translation) 
          ) {
            if(!(allModels[programState.collisionObjectIndex] && allModels[programState.collisionObjectIndex].belongsTo instanceof Player)) {
              programState.collisionObjectIndex = whichEntity;
              let [row, column] = [currEntity.belongsTo.row, currEntity.belongsTo.column];
              enemyGroupRef.enemies[row][column] = null;
              if(currEntity.belongsTo == enemyGroupRef.activeEnemy) {
                enemyGroupRef.activeEnemy.alive = false;
              }
              projectile.reset();
              programState.allowFire = false;
            }
            (function() {
              setTimeout(() => {
              if(!(allModels[programState.collisionObjectIndex] && allModels[programState.collisionObjectIndex].belongsTo instanceof Player)) {
                  programState.allowFire = true;
                  if(allModels[programState.collisionObjectIndex].belongsTo instanceof Enemy) {
                    for(let i = 0; i < 3; i ++) {
                      searchAndNullifyModel(allModels[programState.collisionObjectIndex].belongsTo.projectiles[i].geometry.index);
                    }
                  }
                  searchAndNullifyModel(programState.collisionObjectIndex)
                  programState.collisionObjectIndex = null;
                }
              }, 1000);
            })();
          }
          if(projectile.fromPlayer == false &&
            checkCollisionWithVec33D(programState.player.geometry.boundingBox, getModelMatrixForEntity(programState.player.geometry), projectile.geometry.boundingBox, projectile.translation)) {
              if(!(allModels[programState.collisionObjectIndex] && allModels[programState.collisionObjectIndex].belongsTo instanceof Player)) {
                programState.collisionObjectIndex = programState.player.geometry.index;
                projectile.reset();
                programState.allowPlayer = false;
              }
          }
        }

        // FEED
        gl.uniformMatrix4fv(pvMatrixULoc, false, pvMatrix); // pass in the hpvm matrix
        
        // reflectivity: feed to the fragment shader
        gl.uniform3fv(ambientULoc,currEntity.material.ambient); // pass in the ambient reflectivity
        gl.uniform3fv(diffuseULoc,currEntity.material.diffuse); // pass in the diffuse reflectivity
        gl.uniform3fv(specularULoc,currEntity.material.specular); // pass in the specular reflectivity
        gl.uniform1f(shininessULoc,currEntity.material.n); // pass in the specular exponent
        
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordsBuffers[whichEntity]);
        if(programState.collisionObjectIndex === whichEntity) {
          gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(generateUVsForFrontFace(programState.spriteSheet.explosion)),gl.DYNAMIC_DRAW);
        }
        else if(enemyGroupRef.useAlternateTexture && (currEntity.belongsTo instanceof Enemy)) {
          gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currEntity.glAltTexCoords),gl.DYNAMIC_DRAW);
        } else {
          gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currEntity.glTexCoords),gl.DYNAMIC_DRAW);
        }
        gl.vertexAttribPointer(texCoordsLocation, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1i(textureLocation, 0);
        gl.uniform1i(useTexture, 1);

        // vertex buffer: activate and feed into vertex shader
        gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[whichEntity]); // activate
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(newVertices),gl.DYNAMIC_DRAW); // data in
        gl.vertexAttribPointer(vPosAttribLoc,3,gl.FLOAT,false,0,0); // feed

        gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[whichEntity]); // activate
        gl.vertexAttribPointer(vNormAttribLoc,3,gl.FLOAT,false,0,0); // feed

        // triangle buffer: activate and render
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffers[whichEntity]); // activate
        gl.drawElements(gl.TRIANGLES,3*triSetSizes[whichEntity],gl.UNSIGNED_SHORT,0); // render
        // FEED - END

    } // end for each triangle set
} // end render model

function generateUVsForFrontFace(uvs) {
  return [
    ...uvs[3],
    ...uvs[2],
    ...uvs[1],
    ...uvs[0],
    ...uvs[3],
    ...uvs[2],
    ...uvs[1],
    ...uvs[0]
  ]
}

function initiate() {
  setupWebGL(); // set up the webGL environment
  loadSpriteSheet();
  const enemyGeometry = initEnemyGroup();
  const playerGeometry = initPlayer();
  let totalGeometry = [];
  totalGeometry = totalGeometry.concat(playerGeometry);
  totalGeometry = totalGeometry.concat(enemyGeometry);
  loadModels(totalGeometry); // load in the models & setup the buffers
  setupShaders(); // setup the webGL shaders
}

function process() {
  renderModels(); // draw the triangles using webGL
}

function loadSpriteSheet() {
  function isPowerOf2(value) {
    return (value & (value - 1)) == 0;
  }
  programState.spriteSheet.imageObject = new Image();
  programState.spriteSheet.imageObject.crossOrigin = "Anonymous";
  programState.spriteSheet.imageObject.onload = function() {
    gl.bindTexture(gl.TEXTURE_2D, textureBuffer);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, programState.spriteSheet.imageObject);
    gl.generateMipmap(gl.TEXTURE_2D);
      // Check if the image is a power of 2 in both dimensions.
    if (isPowerOf2(programState.spriteSheet.imageObject.width) && isPowerOf2(programState.spriteSheet.imageObject.height)) {
        // Yes, it's a power of 2. Generate mips.
        gl.generateMipmap(gl.TEXTURE_2D);
    } else {
        // No, it's not a power of 2. Turn off mips and set wrapping to clamp to edge
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  }
  programState.spriteSheet.imageObject.src = programState.spriteSheet.location;
}

/* MAIN -- HERE is where execution begins after window load */

function main() {
  initiate();
  process();
} // end main

function applyTranslationToCenter(center, translation) {
  // Create a new array to store the translated vertices
    return [
      center[0] + translation[0], // Add translation to x
      center[1] + translation[1], // Add translation to y
      center[2] + translation[2], // Add translation to z
    ]
}

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSinusoidalTranslationVector(start, end, totalTime, currentTime, amplitude = 10, periods = 2) {
  // Clamp the current time between 0 and totalTime
  currentTime = Math.max(0, Math.min(currentTime, totalTime));
  
  // Calculate normalized time (0 to 1)
  const t = currentTime / totalTime;

  // Calculate the delta values
  let deltaX = end[0] - start[0];
  let deltaY = end[1] - start[1];

  // Create a sinusoidal oscillation for X
  const sinFactor = amplitude * Math.sin(periods * Math.PI * t); // Oscillation factor for X

  // X oscillates while transitioning linearly
  const translationX = deltaX * t + sinFactor * deltaX * 0.1;

  // Y transitions linearly without oscillations
  const translationY = deltaY * t;

  // Z translation is zero (no movement in Z)
  const translationZ = 0;

  // Return the translation vector
  return vec3.fromValues(translationX, translationY, translationZ);
}

function getProjectileTranslation(start, end, totalTime, currentTime) {
  // Clamp the current time between 0 and totalTime
  currentTime = Math.max(0, Math.min(currentTime, totalTime));

  // Calculate normalized time (0 to 1)
  const t = currentTime / totalTime;

  // Calculate the linearly interpolated values
  const translationX = start[0] + (end[0] - start[0]) * t;
  const translationY = start[1] + (end[1] - start[1]) * t; // This will go down if start[1] > end[1]
  // Return the translation vector
  return vec3.fromValues(translationX, translationY, 0);
}

function generateCircularAndDivingLeapTranslationVector(start_param, end, totalTime, currentTime, amplitude = 0.3, loops = 2) {
  // Clamp currentTime between 0 and totalTime
  currentTime = Math.max(0, Math.min(currentTime, totalTime));
  let start = start_param;

  // Calculate normalized time (0 to 1)
  const t = currentTime / totalTime;

  // Calculate delta values
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];

  // Midpoint values for seamless transition
  const midX = start[0] + deltaX * 0.5;
  const midY = start[1] + deltaY * 0.2;

  // Before 50% of the time: Circular motion
  if (t <= 0.5) {
    const circleProgress = t * 2; // Normalize for 0-1 within the first half
    const angle = circleProgress * loops * 2 * Math.PI; // Full loops within 50%

    // Oscillation factors for circular motion
    const oscillationX = amplitude * Math.cos(angle);
    const oscillationY = amplitude * Math.sin(angle);

    // Add circular motion relative to start position
    const translationX = start[0] + deltaX * circleProgress + oscillationX;
    const translationY = start[1] + oscillationY - 1.0; // Shift Y motion down by 1.0

    return vec3.fromValues(translationX, translationY, 0);
  }

  // After 50% of the time: Nosedive
  const noseDiveProgress = (t - 0.5) * 2; // Normalize for 0-1 within the second half

  // Extend the nosedive beyond the end position by adjusting the final progress slightly beyond 1
  const extendedProgress = Math.min(noseDiveProgress, 1.1); // Slightly beyond 1 to overshoot the end

  // Nosedive starts from where the circular motion ends
  const translationX = midX + deltaX * extendedProgress;  // Continue X movement smoothly into nosedive
  const translationY = midY + deltaY * extendedProgress - 1.0; // Continue Y motion downward smoothly

  return vec3.fromValues(translationX, translationY, 0);
}
