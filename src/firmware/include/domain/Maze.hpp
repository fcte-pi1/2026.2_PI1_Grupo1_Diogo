namespace micromouse::domain {

class MazeMap {
private:
    int rows_;
    int columns_;

public:
    MazeMap(int rows, int columns);

    [[nodiscard]] int rows() const noexcept;
    [[nodiscard]] int columns() const noexcept;
};

}  // namespace micromouse::domain
