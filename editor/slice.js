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

function openCloseSlice(openPath, closePath, innerSegments) {
  if (innerSegments.length == 0) {
    return [closePath.clone(false)];
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
        seg.join(nextSeg, 2);
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

function slicePaths(p1, p2) {
  let res = [];

  const intersections = p1.getIntersections(p2);
  if (intersections.length == 0) {
    return res;
  }

  function addRes(p) {
    res.push(p.children || p);
  }

  if (!p1.closed && !p2.closed) {
    addRes(openOpenSlice(p1, p2));
    addRes(openOpenSlice(p2, p1));
  } else if (p1.closed && !p2.closed) {
    const lineSegments = openOpenSlice(p2, p1);

    const modRes = p1.contains(lineSegments[0].firstSegment.point) ? 0 : 1;
    const innerPaths = [];
    const outerPaths = [];
    lineSegments.forEach((seg, i) => {
      if (i % 2 === modRes) {
        innerPaths.push(seg);
      } else {
        outerPaths.push(seg);
      }
    });

    if (innerPaths.length > 0) {
      addRes(openCloseSlice(p2, p1, innerPaths));
    } else {
      addRes(p1);
    }
    addRes(outerPaths);
  } else if (!p1.closed && p2.closed) {
    return slicePaths(p2, p1);
  } else {
    const intersect = p1.intersect(p2);
    if (intersect && intersect.closed) {
      addRes(intersect);
      addRes(p1.exclude(p2));
    }
  }

  return res.flat();
}

export default slicePaths;
