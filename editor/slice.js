function openOpenSlice(openPath1, openPath2) {
  const p1 = openPath1.clone(false);
  const intersections = p1.getIntersections(openPath2);

  const res = [];
  let lastRes = p1;

  res.push(lastRes);
  for (const intersection of intersections) {
    lastRes = lastRes.split(intersection);
    if (lastRes) {
      res.push(lastRes);
    }
  }

  return res;
}

function getSegHash(segments) {
  const res = {};
  segments.forEach(seg => {
    [seg.firstSegment.point, seg.lastSegment.point].forEach(p => {
      res[p.toString()] = seg;
    });
  });
  return res;
}

function getCrossingsSegments(openPath, closePath) {
  const lineSegments = openOpenSlice(openPath, closePath).filter(
    s => s.segments.length > 1
  );

  const modRes = closePath.contains(lineSegments[0].firstSegment.point) ? 0 : 1;
  const innerPaths = [];
  const outerPaths = [];
  lineSegments.forEach((seg, i) => {
    if (i % 2 === modRes) {
      innerPaths.push(seg);
    } else {
      outerPaths.push(seg);
    }
  });

  return [innerPaths, outerPaths];
}

function openCloseSlice(openPath, closePath, innerSegments) {
  if (innerSegments.length == 0) {
    return [closePath.clone(false)];
  }

  const originalOpenPath = getOriginPath(openPath);
  if (openPath !== originalOpenPath) {
    innerSegments = getCrossingsSegments(originalOpenPath, closePath)[0];
  }

  const res = [];
  const segments = openOpenSlice(closePath, openPath);
  segments.shift();

  const linePointMap = getSegHash(innerSegments);
  const openPointMap = getSegHash(segments);

  const pointMaps = [openPointMap, linePointMap];
  for (const seg of segments) {
    if (!seg.used) {
      let nextSeg = linePointMap[seg.lastSegment.point.toString()];
      let i = 0;
      while (nextSeg) {
        nextSeg.used = true;
        seg.join(nextSeg, 1);
        if (seg.closed) {
          break;
        }

        nextSeg = pointMaps[i % 2][nextSeg.lastSegment.point.toString()];
        i++;
      }
      res.push(seg);
    }
  }

  return res;
}

function fromSameOrigin(p1, p2) {
  return (
    p1.sliceOrigin &&
    p2.sliceOrigin &&
    Object.keys(p1.sliceOrigin).find(k => p2.sliceOrigin[k])
  );
}

function getOriginPath(p) {
  let res = p;
  while (res.parentPath) {
    res = res.parentPath;
  }
  return res;
}

function addSliceId(p, sliceId) {
  p.sliceOrigin = p.sliceOrigin || {};
  p.sliceOrigin[`cut_${sliceId}`] = true;
}

function sliceTwoPaths(p1, p2, sliceId, options) {
  let res = [];

  if (fromSameOrigin(p1, p2)) {
    return res;
  }

  const intersections = p1.getIntersections(p2);
  if (intersections.length == 0) {
    addSliceId(p1, sliceId);
    addSliceId(p2, sliceId);
    return res;
  }

  function addRes(p, parents) {
    parents = parents || [p1, p2];
    const slices = Array.isArray(p) ? p : p.children || [p];

    for (const slice of slices) {
      addSliceId(slice, sliceId);
      for (const parent of parents) {
        slice.parentPath = parent;
        slice.sliceOrigin = Object.assign(
          {},
          slice.sliceOrigin,
          { [`path_${parent.id}`]: true },
          parent.sliceOrigin
        );
      }

      res.push(slice);
    }
  }

  if (!p1.closed && !p2.closed) {
    addRes(openOpenSlice(p1, p2), [p1]);
    addRes(openOpenSlice(p2, p1), [p2]);
  } else if (p1.closed && !p2.closed) {
    if (options.closePaths) {
      const [innerPaths, outerPaths] = getCrossingsSegments(p2, p1);
      if (innerPaths.length > 0) {
        addRes(openCloseSlice(p2, p1, innerPaths), [p1]);
        addRes(outerPaths, [p2]);
      }
    } else {
      const res1 = openOpenSlice(p1, p2);
      res1.shift(); // The first element is duplicated

      addRes(res1, [p1]);
      addRes(openOpenSlice(p2, p1), [p2]);
    }
  } else if (!p1.closed && p2.closed) {
    return sliceTwoPaths(p2, p1, sliceId, options);
  } else {
    const intersect = p1.intersect(p2);
    if (intersect && intersect.closed && intersect.area > 1) {
      addRes(intersect, [p1, p2]);
      addRes(p1.subtract(intersect), [p1]);
      addRes(p2.subtract(intersect), [p2]);
    }
  }

  return res.flat();
}

function slicePaths(paths, opts) {
  const options = Object.assign({}, { closePaths: true }, opts);
  if (paths.length > 1) {
    const finalSlices = [];
    let slicesBag = [...paths];
    let sliceCount = 0;

    for (let i = 0; i < slicesBag.length - 1; i++) {
      const current = slicesBag[i];
      for (let j = i + 1; j < slicesBag.length; j++) {
        const p = slicesBag[j];
        const slices = sliceTwoPaths(current, p, ++sliceCount, options);
        if (slices.length > 0) {
          const newSliceBag = slicesBag.filter(
            (s, idx) => idx > i && idx !== j
          );
          if (newSliceBag.length > 0) {
            slicesBag = [...slices, ...newSliceBag];
            i = -1;
            break;
          } else {
            return [...finalSlices, ...slices];
          }
        }
      }
      if (i >= 0) {
        finalSlices.push(current);
        if (i === slicesBag.length - 2) {
          finalSlices.push(slicesBag.pop());
        }
      }
    }

    return finalSlices;
  }
}

export default slicePaths;
