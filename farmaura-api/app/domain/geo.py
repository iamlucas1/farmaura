"""
farmaura-api/app/domain/geo.py

Pure geo-distance, graph-search, and route-splitting helpers for Farmaura.

Responsibilities:
- compute real great-circle distance between two coordinates;
- build a sparse k-nearest-neighbor proximity graph over a set of points;
- find the real shortest path between two nodes of that graph via bidirectional
  Dijkstra (searching outward from both ends at once, meeting in the middle —
  explores far fewer nodes than a single one-directional search would);
- order a set of delivery stops into a route using that graph search;
- split stops into several simultaneous routes (one per available driver) by
  sweeping an angular ray around the store, so each route stays a coherent
  slice of the map instead of overlapping the others;

Observations:
- a fully-connected graph (every point wired straight to every other point)
  makes Dijkstra pointless — the "shortest path" between any two nodes is
  always just the direct edge, no search needed. The k-nearest-neighbor graph
  built here is deliberately sparse so a path between two distant stops
  actually has to hop through intermediate ones, which is what makes the
  bidirectional search a real graph search and not decoration;
- none of this models real streets (no road network data is loaded anywhere
  in this system) — edge weights are still straight-line haversine distances,
  same approximation every other distance calculation in this codebase uses;
  what changed is *how many stops a route visits at once* and *what order*,
  not the accuracy of a single point-to-point measurement;
- nearest-neighbor-over-the-graph is not provably optimal (true TSP is
  NP-hard and not worth the complexity for the handful of stops one store
  dispatches at once) — see
  dev-obsidian/farmaura/06_Pendencias/rota-de-entrega-sem-otimizacao-real.md;
- pure math, no I/O, no ORM — safe to unit test and reuse from any service.
"""

from __future__ import annotations

import heapq
from decimal import Decimal
from math import atan2, cos, radians, sin, sqrt

Coordinate = tuple[Decimal, Decimal]
Graph = list[list[tuple[int, float]]]  # adjacency list: graph[i] = [(neighbor_index, weight_km), ...]

EARTH_RADIUS_KM = 6371.0
DEFAULT_GRAPH_K = 5  # neighbors per node — enough to keep the graph connected for realistic
# store-radius stop counts without ballooning edge count; tune up if routes start looking odd.


# ============================================================================
# DISTANCE
# ============================================================================


def haversine_km(lat1: Decimal, lng1: Decimal, lat2: Decimal, lng2: Decimal) -> Decimal:
    """Return the real great-circle distance in kilometers between two coordinates."""

    phi1, phi2 = radians(float(lat1)), radians(float(lat2))
    delta_phi = radians(float(lat2) - float(lat1))
    delta_lambda = radians(float(lng2) - float(lng1))
    a = sin(delta_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2) ** 2
    return Decimal(str(EARTH_RADIUS_KM * 2 * atan2(sqrt(a), sqrt(1 - a))))


def route_length_km(origin: Coordinate, stops_in_order: list[Coordinate]) -> Decimal:
    """Return the total length of a route that starts at `origin` and visits `stops_in_order` in sequence."""

    total = Decimal("0.00")
    current = origin
    for point in stops_in_order:
        total += haversine_km(current[0], current[1], point[0], point[1])
        current = point
    return total


# ============================================================================
# PROXIMITY GRAPH
# ============================================================================


def _connected_components(adjacency: list[dict[int, float]]) -> list[list[int]]:
    """Return the connected components of an undirected adjacency-dict graph, via plain BFS."""

    n = len(adjacency)
    seen = [False] * n
    components: list[list[int]] = []
    for start in range(n):
        if seen[start]:
            continue
        seen[start] = True
        queue = [start]
        component = [start]
        while queue:
            node = queue.pop()
            for neighbor in adjacency[node]:
                if not seen[neighbor]:
                    seen[neighbor] = True
                    component.append(neighbor)
                    queue.append(neighbor)
        components.append(component)
    return components


def build_proximity_graph(points: list[Coordinate], *, k: int = DEFAULT_GRAPH_K) -> Graph:
    """Build a sparse k-nearest-neighbor graph over `points` (undirected, weighted by real
    haversine distance in km). Each node connects only to its `k` geographically closest other
    nodes — not to every node — so a path between two distant points genuinely has to route
    through intermediates, the way a real road network would.

    If that leaves the graph split into more than one connected component (happens when a
    cluster of points sits far from the rest), each extra component is bridged by wiring its
    closest pair of nodes to the main component, so every node stays reachable from every
    other node — bidirectional Dijkstra can't find a path across a gap that was never wired.
    """

    n = len(points)
    if n <= 1:
        return [[] for _ in range(n)]

    distance = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            d = float(haversine_km(points[i][0], points[i][1], points[j][0], points[j][1]))
            distance[i][j] = distance[j][i] = d

    adjacency: list[dict[int, float]] = [dict() for _ in range(n)]
    for i in range(n):
        nearest = sorted((j for j in range(n) if j != i), key=lambda j: distance[i][j])[:k]
        for j in nearest:
            adjacency[i][j] = distance[i][j]
            adjacency[j][i] = distance[i][j]

    components = _connected_components(adjacency)
    while len(components) > 1:
        comp_a, comp_b = components[0], components[1]
        bridge_i, bridge_j = min(
            ((i, j) for i in comp_a for j in comp_b),
            key=lambda pair: distance[pair[0]][pair[1]],
        )
        adjacency[bridge_i][bridge_j] = distance[bridge_i][bridge_j]
        adjacency[bridge_j][bridge_i] = distance[bridge_i][bridge_j]
        components = _connected_components(adjacency)

    return [sorted(adj.items()) for adj in adjacency]


# ============================================================================
# BIDIRECTIONAL DIJKSTRA
# ============================================================================


def bidirectional_dijkstra(graph: Graph, source: int, target: int) -> tuple[float, list[int]]:
    """Return the shortest-path distance and node path from `source` to `target` on `graph`,
    searching outward from both ends simultaneously and meeting in the middle.

    Each step expands whichever of the two frontiers has explored less so far (the standard
    balancing rule), and stops as soon as the best confirmed meeting distance can no longer be
    beaten by either side — the same correctness guarantee as one-directional Dijkstra, reached
    by exploring a smaller combined set of nodes. Returns `(inf, [])` if the graph has no path
    between the two nodes (should not happen after `build_proximity_graph`'s bridging step).
    """

    if source == target:
        return 0.0, [source]

    n = len(graph)
    inf = float("inf")
    dist_f = [inf] * n
    dist_b = [inf] * n
    dist_f[source] = 0.0
    dist_b[target] = 0.0
    prev_f: dict[int, int] = {}
    prev_b: dict[int, int] = {}
    visited_f: set[int] = set()
    visited_b: set[int] = set()
    queue_f: list[tuple[float, int]] = [(0.0, source)]
    queue_b: list[tuple[float, int]] = [(0.0, target)]
    best = inf
    meeting_node: int | None = None

    def expand(
        queue: list[tuple[float, int]],
        dist: list[float],
        prev: dict[int, int],
        visited: set[int],
        other_visited: set[int],
    ) -> None:
        nonlocal best, meeting_node
        d, u = heapq.heappop(queue)
        if u in visited:
            return
        visited.add(u)
        for v, w in graph[u]:
            candidate = d + w
            if candidate < dist[v]:
                dist[v] = candidate
                prev[v] = u
                heapq.heappush(queue, (candidate, v))
        if u in other_visited:
            total = dist_f[u] + dist_b[u]
            if total < best:
                best = total
                meeting_node = u

    while queue_f and queue_b:
        if queue_f[0][0] + queue_b[0][0] >= best:
            break
        if queue_f[0][0] <= queue_b[0][0]:
            expand(queue_f, dist_f, prev_f, visited_f, visited_b)
        else:
            expand(queue_b, dist_b, prev_b, visited_b, visited_f)

    if meeting_node is None:
        return inf, []

    path_from_source = [meeting_node]
    node = meeting_node
    while node != source:
        node = prev_f[node]
        path_from_source.append(node)
    path_from_source.reverse()

    path_to_target: list[int] = []
    node = meeting_node
    while node != target:
        node = prev_b[node]
        path_to_target.append(node)

    return best, path_from_source + path_to_target


# ============================================================================
# ROUTE ORDERING
# ============================================================================


def nearest_neighbor_order(origin: Coordinate, points: list[Coordinate]) -> list[int]:
    """Return the indices of `points`, reordered by always visiting the closest not-yet-visited
    point next, by straight-line distance. Simple O(n^2) fallback for when a full graph search
    is not warranted (e.g. a single stop, or a route that was already split down to very few
    points) — prefer `nearest_neighbor_order_via_graph` when you want the real bidirectional
    Dijkstra search over a proximity graph instead of raw point-to-point distance.
    """

    remaining = list(range(len(points)))
    order: list[int] = []
    current = origin
    while remaining:
        closest = min(remaining, key=lambda i: haversine_km(current[0], current[1], points[i][0], points[i][1]))
        order.append(closest)
        remaining.remove(closest)
        current = points[closest]
    return order


def nearest_neighbor_order_via_graph(
    origin: Coordinate, points: list[Coordinate], *, k: int = DEFAULT_GRAPH_K
) -> tuple[list[int], Decimal]:
    """Order `points` into a route by always visiting the graph-shortest-path-closest
    not-yet-visited point next, where "closest" is the real distance bidirectional Dijkstra
    finds over a sparse k-nearest-neighbor graph built from `origin` + `points` together — not
    a raw straight-line jump. Returns `(visiting order as indices into points, total route km)`.
    """

    if not points:
        return [], Decimal("0.00")

    all_nodes = [origin, *points]
    graph = build_proximity_graph(all_nodes, k=k)
    remaining = list(range(1, len(all_nodes)))  # node 0 is the origin, never a stop to visit
    order: list[int] = []
    current = 0
    total_km = 0.0
    while remaining:
        best_node: int | None = None
        best_dist = float("inf")
        for candidate in remaining:
            dist, _path = bidirectional_dijkstra(graph, current, candidate)
            if dist < best_dist:
                best_dist = dist
                best_node = candidate
        assert best_node is not None  # guaranteed: `remaining` is non-empty and the graph is connected
        order.append(best_node - 1)  # back to an index into `points`
        remaining.remove(best_node)
        total_km += best_dist
        current = best_node
    return order, Decimal(str(total_km))


# ============================================================================
# MULTI-ROUTE SPLITTING
# ============================================================================


def sweep_clusters(origin: Coordinate, points: list[Coordinate], num_clusters: int) -> list[list[int]]:
    """Split `points` into `num_clusters` geographically coherent groups — one per simultaneous
    delivery route — by sweeping a ray around `origin` (the store) through 360 degrees and
    cutting it into `num_clusters` equal angular slices ordered by bearing from the store. This
    is the classic "sweep" heuristic for splitting one big delivery run into several running at
    once: each driver's stops stay roughly in the same direction from the store, instead of
    routes criss-crossing each other's territory the way a naive index-based split would.

    Returns a list of `num_clusters` index lists into `points` (sizes differ by at most one).
    """

    if num_clusters <= 1 or not points:
        return [list(range(len(points)))]

    def bearing(point: Coordinate) -> float:
        delta_lat = float(point[0]) - float(origin[0])
        delta_lng = float(point[1]) - float(origin[1])
        return atan2(delta_lat, delta_lng)

    swept = sorted(range(len(points)), key=lambda i: bearing(points[i]))
    base_size, extra = divmod(len(swept), num_clusters)
    clusters: list[list[int]] = []
    position = 0
    for cluster_index in range(num_clusters):
        size = base_size + (1 if cluster_index < extra else 0)
        clusters.append(swept[position : position + size])
        position += size
    return clusters
