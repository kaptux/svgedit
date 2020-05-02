import BT from "./bintree.js";
import { getBBox } from "./utilities.js";
import { transformPoint } from "./math.js";

function comparator(a, b) {
  return a.value - b.value;
}

function logTree(sh, tree) {
  console.log("======== tree =========");
  console.log(sh);
  console.log("--------------");
  tree.each(obj => {
    console.log(obj.value, obj.elements);
  });
  console.log("=======================");
}

function AnchorSystem(opts) {
  const CANVAS_ID = "canvas";

  const shapeHashmap = {};
  const xTree = new BT(comparator);
  const yTree = new BT(comparator);

  const options = Object.assign(
    {},
    {
      delta: 0
    },
    opts
  );

  function getElemIdInt(id) {
    return hashCode(id);
  }

  function getNearestValue(v, tree) {
    const it = tree.upperBound({ value: v });
    if (it && it.data()) {
      const v1 = it.data();
      const v2 = it.prev() || { value: null };

      const diff1 = Math.abs(v1.value - v);
      let diff2 = Number.MAX_SAFE_INTEGER;

      if (v2.value !== null) {
        diff2 = Math.abs(v2.value - v);
      }

      if (diff1 < diff2 && diff1 <= options.delta) {
        return [v1.value, v1.value - v, v1.elements];
      }

      if (diff2 < diff1 && diff2 <= options.delta) {
        return [v2.value, v2.value - v, v2.elements];
      }
    }
    return [null, null];
  }

  function getBboxPoints(box) {
    let res = [];
    if (box) {
      const { x, y, width, height } = box;
      res = [
        { x, y }, //TopLeft
        // { x: x + width / 2, y }, //TopMiddle
        // { x: x + width, y }, //TopRight
        // { x: x + width, y: y + height / 2 }, //RightMiddle
        { x: x + width, y: y + height }, //BotomRight
        // { x: x + width / 2, y: y + height }, //BottomMiddle
        // { x, y: y + height }, //BottomLeft
        { x: x + width / 2, y: y + height / 2 } //Center
      ];
    }
    return res;
  }

  function getShapePoints(elem) {
    let res = [];

    if (elem) {
      const bbox = getBBox(elem);
      const { x, y, width, height } = bbox;
      switch (elem.tagName) {
        case "polygon":
          const pt = elem.getAttribute("points");
          res = pt.split(" ").map(v => {
            const [x, y] = v.split(",");
            return { x, y };
          });
          res.push({ x: x + width / 2, y: y + height / 2 }); //Shape center
          break;
        case "path":
          const segList = elem.pathSegList;
          for (let i = 0; i < segList.numberOfItems; i++) {
            const { x, y } = segList.getItem(i);
            if (typeof x !== "undefined" && typeof y !== "undefined") {
              res.push({ x, y });
            }
          }
          res.push({ x: x + width / 2, y: y + height / 2 }); //Shape center
          break;
        default:
          res = getBboxPoints(bbox);
          break;
      }
    }

    return res;
  }

  function addToHashmap(hm, coor, elemId) {
    hm[coor] = hm[coor] || new BT(comparator);
    hm[coor].insert(elemId);
  }

  function removeFromHashmap(tree, coor, elemId) {
    let item = { value: coor };
    item = tree.find(item);
    if (item) {
      delete item.elements[elemId];
      if (Object.keys(item.elements).length == 0) {
        tree.remove(item);
      }
    }
  }

  function insertPoint(tree, coor, point, elemId) {
    let data = { value: coor, elements: {} };
    data = tree.insert(data);
    data.elements[elemId] = point;
  }

  function removePoints(points, elemId) {
    if (points && points.length) {
      for (const point of points) {
        const { x, y } = point;
        removeFromHashmap(xTree, x, elemId);
        removeFromHashmap(yTree, y, elemId);
      }
    }
  }

  function removeShape(elem) {
    if (!elem) {
      return;
    }

    let res = [];
    const elemId = elem.id;
    const points = shapeHashmap[elemId];

    if (points) {
      removePoints(points, elemId);
      delete shapeHashmap[elemId];
      res = points;
    }

    return res;
  }

  function addPoints(points, elemId) {
    for (const point of points) {
      const { x, y } = point;
      insertPoint(xTree, x, point, elemId);
      insertPoint(yTree, y, point, elemId);
    }
  }

  function addShape(elem, newPoints) {
    if (!elem) {
      return;
    }

    const elemId = elem.id;

    // remove current points
    let points = shapeHashmap[elemId];
    if (points) {
      removePoints(points, elemId);
    }

    // add new ones
    points = newPoints || getShapePoints(elem);
    shapeHashmap[elemId] = points;
    addPoints(points, elemId);

    return points;
  }

  function transformPoints(points, matrix) {
    return points.map(pt => transformPoint(pt.x, pt.y, matrix));
  }

  function setCanvas(rect) {
    let points = shapeHashmap[CANVAS_ID];
    if (points) {
      removePoints(points);
    }

    points = getBboxPoints(rect);
    addPoints(points, CANVAS_ID);
  }

  function updateShape(elem) {
    removeShape(elem);
    return addShape(elem);
  }

  function getGuidesForPoint(point, delta) {
    delta = delta || { x: 0, y: 0 };
    let res = {};
    if (point) {
      const { x, y } = point;
      const [vX, dX, elementsX] = getNearestValue(x + delta.x, xTree);
      const [vY, dY, elementsY] = getNearestValue(y + delta.y, yTree);

      res = {
        x: vX,
        y: vY,
        dX,
        dY,
        elementsX,
        elementsY
      };
    }
    return res;
  }

  function getGuidesForShapes(shapes, pointsHashmap, delta) {
    const res = {};
    for (const shape of shapes) {
      const points = pointsHashmap[shape.id];
      if (points) {
        for (const point of points) {
          const guides = getGuidesForPoint(point, delta);
          if (
            res.x == null &&
            guides.x != null &&
            !guides.elementsX[shape.id]
          ) {
            res.x = guides.x;
            res.dX = guides.dX;
          }
          if (
            res.y == null &&
            guides.y != null &&
            !guides.elementsY[shape.id]
          ) {
            res.y = guides.y;
            res.dY = guides.dY;
          }

          if (res.x != null && res.y != null) {
            return res;
          }
        }
      }
    }

    return res;
  }

  function getPointsOfInteres(elem) {
    return getShapePoints(elem);
  }

  return {
    addShape,
    removeShape,
    updateShape,
    getGuidesForPoint,
    getGuidesForShapes,
    getPointsOfInteres,
    setCanvas
  };
}

export default AnchorSystem;
