import BT from "./bintree.js";
import { getBBox } from "./utilities.js";
import { transformPoint } from "./math.js";

function comparator(a, b) {
  return a - b;
}

function AnchorSystem(opts) {
  const CANVAS_ID = 0;

  const shapeHashmap = {};
  const xTree = new BT(comparator);
  const yTree = new BT(comparator);
  const xHashmap = {};
  const yHashmap = {};

  const options = Object.assign(
    {},
    {
      delta: 0
    },
    opts
  );

  function getElemIdInt(id) {
    return parseInt(id.split("_")[1], 10);
  }

  function getNearestValue(v, tree) {
    const it = tree.upperBound(v);
    if (it) {
      const v1 = it.data();
      const v2 = it.prev();

      const diff1 = Math.abs(v1 - v);
      let diff2 = Number.MAX_SAFE_INTEGER;

      if (v2 !== null) {
        diff2 = Math.abs(v2 - v);
      }

      if (diff1 < diff2 && diff1 <= options.delta) {
        return [v1, v1 - v];
      }

      if (diff2 < diff1 && diff2 <= options.delta) {
        return [v2, v2 - v];
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
        { x: x + width / 2, y }, //TopMiddle
        { x: x + width, y }, //TopRight
        { x: x + width, y: y + height / 2 }, //RightMiddle
        { x: x + width, y: y + height }, //BotomRight
        { x: x + width / 2, y: y + height }, //BottomMiddle
        { x, y: y + height }, //BottomLeft
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
        case "line":
          const x1 = elem.getAttribute("x1"),
            y1 = elem.getAttribute("y1"),
            x2 = elem.getAttribute("x2"),
            y2 = elem.getAttribute("y2");

          res.push({ x: x1, y: y1 });
          res.push({ x: x2, y: y2 });
          res.push({ x: Math.abs(x2 - x1), y: Math.abs(y2 - y1) }); //Middle of the line
          break;
        case "polygon":
          const pt = elem.getAttribute("points");
          res = pt.split(" ").map(v => {
            const [x, y] = v.split(",");
            return { x, y };
          });
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

  function removeFromHashmap(hm, coor, elemId, tree) {
    const ids = hm[coor];
    if (ids) {
      ids.remove(elemId);
      if (ids.size == 0) {
        tree.remove(coor);
      }
    }
  }

  function removePoints(points, elemId) {
    if (points && points.length) {
      for (const point of points) {
        const { x, y } = point;
        removeFromHashmap(xHashmap, x, elemId, xTree);
        removeFromHashmap(yHashmap, y, elemId, yTree);
      }
    }
  }

  function removeShape(elem) {
    if (!elem) {
      return;
    }

    const elemId = getElemIdInt(elem.id);
    const points = shapeHashmap[elemId];
    removePoints(points, elemId);
    delete shapeHashmap[elemId];
    return points;
  }

  function addPoints(points, elemId) {
    for (const point of points) {
      const { x, y } = point;
      xTree.insert(x);
      yTree.insert(y);
      addToHashmap(xHashmap, x, elemId);
      addToHashmap(yHashmap, y, elemId);
    }
  }

  function addShape(elem) {
    if (!elem) {
      return;
    }

    const elemId = getElemIdInt(elem.id);
    const points = getShapePoints(elem);
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
      const [vX, dX] = getNearestValue(x + delta.x, xTree);
      const [vY, dY] = getNearestValue(y + delta.y, yTree);

      res = {
        x: vX,
        y: vY,
        dX,
        dY
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
          if (res.x == null && guides.x != null) {
            res.x = guides.x;
            res.dX = guides.dX;
          }
          if (res.y == null && guides.y != null) {
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
