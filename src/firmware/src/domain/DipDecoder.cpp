#include "domain/DipDecoder.hpp"

#include <stdexcept>

namespace micromouse::domain {

namespace {

struct Dimensions {
    MazeType type;
    int rows;
    int columns;
};

Dimensions decodeType(bool dip1, bool dip2) {
    const int code = (dip2 ? 2 : 0) + (dip1 ? 1 : 0);

    switch (code) {
        case 0:
            return {MazeType::Small4x4, 4, 4};
        case 1:
            return {MazeType::Medium8x4, 4, 8};
        case 2:
            return {MazeType::Large12x4, 4, 12};
        case 3:
            throw std::invalid_argument("DipDecoder: Reserved combination of dip1 and dip2");
    }

    __builtin_unreachable();
}

}  // namespace

bool startBorderIsOnTheLeft(const MazeSetup& setup) noexcept { return setup.start.column == 0; }

StartCheck checkStartCorner(const MazeSetup& setup, bool leftWall, bool leftUnknown,
                            bool rightWall, bool rightUnknown) noexcept {
    const bool onLeft = startBorderIsOnTheLeft(setup);
    const bool wall = onLeft ? leftWall : rightWall;
    const bool unknown = onLeft ? leftUnknown : rightUnknown;
    return (!unknown && !wall) ? StartCheck::BorderSideOpen : StartCheck::Ok;
}

namespace {

Dimensions dimensionsOf(MazeType type) {
    switch (type) {
        case MazeType::Small4x4: return {type, 4, 4};
        case MazeType::Medium8x4: return {type, 4, 8};
        case MazeType::Large12x4: return {type, 4, 12};
        case MazeType::Tall4x8: return {type, 8, 4};
        case MazeType::Tall4x12: return {type, 12, 4};
        case MazeType::Tall4x4: return {type, 4, 4};
    }
    __builtin_unreachable();
}

}  // namespace

bool isPortrait(MazeType type) noexcept {
    return type == MazeType::Tall4x4 || type == MazeType::Tall4x8 || type == MazeType::Tall4x12;
}

MazeType flipOrientation(MazeType type) noexcept {
    switch (type) {
        case MazeType::Small4x4: return MazeType::Tall4x4;
        case MazeType::Tall4x4: return MazeType::Small4x4;
        case MazeType::Medium8x4: return MazeType::Tall4x8;
        case MazeType::Tall4x8: return MazeType::Medium8x4;
        case MazeType::Large12x4: return MazeType::Tall4x12;
        case MazeType::Tall4x12: return MazeType::Large12x4;
    }
    return type;
}

MazeType landscapeOf(MazeType type) noexcept {
    return isPortrait(type) ? flipOrientation(type) : type;
}

MazeSetup makeMazeSetup(MazeType type, bool startRight) {
    const Dimensions dimensions = dimensionsOf(type);
    const Position start{dimensions.rows - 1, startRight ? dimensions.columns - 1 : 0};
    const Position goal{dimensions.rows - 1 - start.row, dimensions.columns - 1 - start.column};
    return {
        dimensions.type,     //
        dimensions.rows,     //
        dimensions.columns,  //
        start,               //
        goal                 //
    };
}

std::optional<MazeType> parseMazeType(std::string_view text) noexcept {
    if (text == "4x4") return MazeType::Small4x4;
    if (text == "8x4") return MazeType::Medium8x4;
    if (text == "12x4") return MazeType::Large12x4;
    if (text == "4x8") return MazeType::Tall4x8;
    if (text == "4x12") return MazeType::Tall4x12;
    return std::nullopt;
}

MazeSetup DipDecoder::decode(bool dip1, bool dip2, bool dip3) const {
    return makeMazeSetup(decodeType(dip1, dip2).type, dip3);
}

}  // namespace micromouse::domain
