#include "domain/ReportFrame.hpp"

namespace micromouse::domain {

ReportFrame::ReportFrame(const MazeSetup& setup) noexcept
    : rotated_(setup.rows > setup.columns),
      clockwise_(setup.start.column != 0),  // largada à direita: giro horário
      rows_(setup.rows),
      columns_(setup.columns),
      reported_(setup.type) {
    if (rotated_) {
        reported_ = setup.rows == 8 ? MazeType::Medium8x4 : MazeType::Large12x4;
    }
}

Position ReportFrame::position(const Position& position) const noexcept {
    if (!rotated_) {
        return position;
    }
    return clockwise_ ? Position{position.column, rows_ - 1 - position.row}
                      : Position{columns_ - 1 - position.column, position.row};
}

Direction ReportFrame::direction(Direction direction) const noexcept {
    if (!rotated_) {
        return direction;
    }
    // Giro horário: N->L, L->S, S->O, O->N. Anti-horário: N->O, L->N, S->L, O->S.
    return clockwise_ ? turnRight(direction) : turnLeft(direction);
}

ReportFrame::Walls ReportFrame::walls(bool north, bool east, bool south, bool west) const noexcept {
    Walls out{false, false, false, false};
    auto put = [this, &out](Direction from, bool present) {
        switch (direction(from)) {
            case Direction::North: out.north = present; break;
            case Direction::East: out.east = present; break;
            case Direction::South: out.south = present; break;
            case Direction::West: out.west = present; break;
        }
    };
    put(Direction::North, north);
    put(Direction::East, east);
    put(Direction::South, south);
    put(Direction::West, west);
    return out;
}

}  // namespace micromouse::domain
